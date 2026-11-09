"""공고 알림 시험용 모의 푸시 서버. 표준 라이브러리만 쓴다.

POST를 받으면 설정한 지연 뒤 비율로 고른 상태 코드를 돌려주고, 요청마다 받은 시각, 응답 시각, 경로,
상태, 그 순간의 동시 요청 수, 본문(암호문)을 JSONL로 남긴다. `/__mock/stats`와 `/__mock/config`로
실행 중 집계를 보고 설정을 바꾼다.
"""

from __future__ import annotations

import base64
import json
import math
import random
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONTROL_PREFIX = "/__mock/"
STATS_PATH = "/__mock/stats"
CONFIG_PATH = "/__mock/config"
MAX_BODY_BYTES = 64 * 1024
MAX_DRAIN_BYTES = 1024 * 1024
MAX_DELAY_MS = 60_000
MAX_RETRY_AFTER_SECONDS = 86_400
RATIO_TOLERANCE = 1e-6
CONFIG_KEYS = frozenset(("delayMs", "statuses", "retryAfterSeconds"))


@dataclass(frozen=True)
class StatusMix:
    """상태 코드와 비율. text는 사람이 준 원문이다."""

    weights: tuple[tuple[int, float], ...]
    text: str


@dataclass(frozen=True)
class MockConfig:
    delay_ms: int
    statuses: StatusMix
    retry_after_seconds: int

    def to_json(self) -> dict:
        return {"delayMs": self.delay_ms, "statuses": self.statuses.text, "retryAfterSeconds": self.retry_after_seconds}


def parse_status_mix(text: object) -> StatusMix:
    """`201=0.9,429=0.1` 형식을 읽는다. 비율의 합은 1이어야 한다."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("상태 비율이 비어 있습니다")
    weights: list[tuple[int, float]] = []
    for part in text.split(","):
        code, ratio = _parse_status_part(part.strip())
        if any(existing == code for existing, _ in weights):
            raise ValueError(f"상태 코드가 중복됩니다: {code}")
        weights.append((code, ratio))
    total = sum(ratio for _, ratio in weights)
    if abs(total - 1.0) > RATIO_TOLERANCE:
        raise ValueError(f"상태 비율의 합이 1이 아닙니다: {total:g}")
    return StatusMix(tuple(weights), ",".join(part.strip().replace(" ", "") for part in text.split(",")))


def _parse_status_part(part: str) -> tuple[int, float]:
    code_text, separator, ratio_text = part.partition("=")
    if not separator:
        raise ValueError(f"상태 비율 형식이 아닙니다: {part}")
    try:
        code = int(code_text)
        ratio = float(ratio_text)
    except ValueError:
        raise ValueError(f"상태 비율 형식이 아닙니다: {part}") from None
    if not 100 <= code <= 599:
        raise ValueError(f"상태 코드 범위가 아닙니다: {code}")
    if not math.isfinite(ratio) or ratio <= 0:
        raise ValueError(f"비율은 0보다 커야 합니다: {part}")
    return code, ratio


def pick_status(mix: StatusMix, draw: float) -> int:
    """[0, 1) 범위의 draw를 누적 비율에 대어 상태 코드를 고른다."""
    if not 0.0 <= draw < 1.0:
        raise ValueError("draw는 0 이상 1 미만이어야 합니다")
    cumulative = 0.0
    for code, ratio in mix.weights:
        cumulative += ratio
        if draw < cumulative:
            return code
    return mix.weights[-1][0]


def make_config(delay_ms: object, statuses: object, retry_after_seconds: object) -> MockConfig:
    mix = statuses if isinstance(statuses, StatusMix) else parse_status_mix(statuses)
    return MockConfig(
        _bounded_int(delay_ms, MAX_DELAY_MS, "지연(ms)"),
        mix,
        _bounded_int(retry_after_seconds, MAX_RETRY_AFTER_SECONDS, "Retry-After(초)"),
    )


def _bounded_int(value: object, maximum: int, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum:
        raise ValueError(f"{name}는 0 이상 {maximum} 이하의 정수여야 합니다")
    return value


def apply_config_update(current: MockConfig, payload: object) -> MockConfig:
    """주어진 키만 바꾼 새 설정을 돌려준다. 현재 설정은 바꾸지 않는다."""
    if not isinstance(payload, Mapping):
        raise ValueError("설정은 JSON 객체여야 합니다")
    unknown = sorted(set(payload) - CONFIG_KEYS)
    if unknown:
        raise ValueError(f"모르는 설정입니다: {', '.join(unknown)}")
    return make_config(
        payload.get("delayMs", current.delay_ms),
        payload.get("statuses", current.statuses),
        payload.get("retryAfterSeconds", current.retry_after_seconds),
    )


class MockState:
    """설정과 실행 중 집계. 여러 요청 스레드가 함께 쓴다."""

    def __init__(self, config: MockConfig):
        self._lock = threading.Lock()
        self._config = config
        self._in_flight = 0
        self._max_in_flight = 0
        self._total = 0
        self._by_status: dict[int, int] = {}
        self._first_received: float | None = None
        self._last_responded: float | None = None

    def config(self) -> MockConfig:
        with self._lock:
            return self._config

    def replace_config(self, config: MockConfig) -> None:
        with self._lock:
            self._config = config

    def enter(self, received_at: float) -> int:
        """요청 시작을 기록하고 이 요청을 포함한 동시 요청 수를 돌려준다."""
        with self._lock:
            self._in_flight += 1
            self._max_in_flight = max(self._max_in_flight, self._in_flight)
            if self._first_received is None:
                self._first_received = received_at
            return self._in_flight

    def leave(self, status: int, responded_at: float) -> None:
        with self._lock:
            self._in_flight -= 1
            self._total += 1
            self._by_status[status] = self._by_status.get(status, 0) + 1
            self._last_responded = responded_at

    def stats(self) -> dict:
        with self._lock:
            return {
                "total": self._total,
                "byStatus": {str(code): count for code, count in sorted(self._by_status.items())},
                "inFlight": self._in_flight,
                "maxInFlight": self._max_in_flight,
                "firstReceivedAt": self._first_received,
                "lastRespondedAt": self._last_responded,
            }


class RequestLog:
    """요청 기록을 한 줄에 하나씩 JSON으로 쓴다."""

    def __init__(self, path: str):
        self._lock = threading.Lock()
        self._file = open(path, "a", encoding="utf-8")

    def write(self, record: Mapping) -> None:
        line = json.dumps(record, separators=(",", ":"))
        with self._lock:
            self._file.write(line + "\n")
            self._file.flush()

    def close(self) -> None:
        with self._lock:
            self._file.close()


class MockServer(ThreadingHTTPServer):
    """요청 스레드가 함께 쓰는 상태, 기록, 난수를 들고 있는 서버."""

    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 1024

    def __init__(self, address, state: MockState, log: RequestLog, draw, seed: int | None):
        self.state = state
        self.log = log
        self.draw = draw
        self.seed = seed
        super().__init__(address, PushHandler)


def build_server(host: str, port: int, state: MockState, log: RequestLog, seed: int | None = None) -> MockServer:
    """seed가 같으면 상태 추첨 순서가 같다. 설정 조회(GET /__mock/config)에 seed도 돌려준다."""
    return MockServer((host, port), state, log, _locked_draw(random.Random(seed)), seed)


def _locked_draw(rng: random.Random):
    lock = threading.Lock()

    def draw() -> float:
        with lock:
            return rng.random()

    return draw


class PushHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "MockPush/1"
    sys_version = ""

    def log_message(self, format, *args):  # noqa: A002 - 표준 라이브러리 서명
        return

    def do_GET(self):
        if self.path == STATS_PATH:
            self._send_json(200, self.server.state.stats())
        elif self.path == CONFIG_PATH:
            self._send_json(200, {**self.server.state.config().to_json(), "seed": self.server.seed})
        else:
            self._send_json(404, {"error": "NOT_FOUND"})

    def do_POST(self):
        received_at = time.time()
        body = self._read_body()
        if body is None:
            self._send_json(413, {"error": "BODY_TOO_LARGE"})
        elif self.path == CONFIG_PATH:
            self._update_config(body)
        elif self.path.startswith(CONTROL_PREFIX):
            self._send_json(404, {"error": "NOT_FOUND"})
        else:
            self._push(received_at, body)

    def _read_body(self) -> bytes | None:
        """본문을 읽는다. 너무 크면 None. 응답 전에 연결이 끊기지 않도록 적당한 크기까지는 읽어서 버린다."""
        try:
            length = max(0, int(self.headers.get("Content-Length") or 0))
        except ValueError:
            length = MAX_DRAIN_BYTES + 1
        if length > MAX_DRAIN_BYTES:
            self.close_connection = True
            return None
        body = self.rfile.read(length) if length > 0 else b""
        return None if length > MAX_BODY_BYTES else body

    def _update_config(self, body: bytes) -> None:
        state = self.server.state
        try:
            updated = apply_config_update(state.config(), json.loads(body or b"null"))
        except ValueError as error:
            self._send_json(400, {"error": "INVALID_CONFIG", "message": str(error)})
            return
        state.replace_config(updated)
        self._send_json(200, updated.to_json())

    def _push(self, received_at: float, body: bytes) -> None:
        state = self.server.state
        concurrency = state.enter(received_at)
        config = state.config()
        status = pick_status(config.statuses, self.server.draw())
        retry_after = config.retry_after_seconds if status == 429 else None
        responded_at = received_at
        try:
            time.sleep(config.delay_ms / 1000)
            self.send_response(status)
            if retry_after is not None:
                self.send_header("Retry-After", str(retry_after))
            self.send_header("Content-Length", "0")
            self.end_headers()
            responded_at = time.time()
        finally:
            state.leave(status, responded_at)
            self.server.log.write(_record(received_at, responded_at, self.path, status, concurrency, retry_after, body))

    def _send_json(self, status: int, payload: Mapping) -> None:
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def _record(received_at, responded_at, path, status, concurrency, retry_after, body) -> dict:
    return {
        "receivedAt": round(received_at, 6),
        "respondedAt": round(responded_at, 6),
        "path": path,
        "status": status,
        "concurrency": concurrency,
        "retryAfter": retry_after,
        "bodyBytes": len(body),
        "body": base64.b64encode(body).decode("ascii"),
    }
