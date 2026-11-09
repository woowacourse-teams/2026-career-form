"""시험 공고를 관리 API로 등록한다."""

from __future__ import annotations

import base64
import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from pushload.markers import TEST_LINK_PREFIX
from pushload.runfiles import iso, validate_run_id

ADMIN_POSTINGS_PATH = "/api/v1/notifications/admin/postings"
ADMIN_SUMMARY_PATH = "/api/v1/notifications/admin/summary"
COMPANY = "loadtest"


def posting_link(run_id: str, number: int) -> str:
    return f"{TEST_LINK_PREFIX}{validate_run_id(run_id)}/{number}"


def registration_payload(run_id: str, number: int, roles: Sequence[str], opens_at: dt.datetime, closes_at: dt.datetime) -> dict:
    return {"company": f"{COMPANY} {number}", "roles": list(roles), "link": posting_link(run_id, number),
            "opensAt": iso(opens_at), "closesAt": iso(closes_at)}


def basic_authorization(password: str) -> str:
    return "Basic " + base64.b64encode(f"quality:{password}".encode()).decode("ascii")


@dataclass(frozen=True)
class ApiResult:
    status: int
    body: dict
    elapsed_ms: float


class RegistrationError(RuntimeError):
    def __init__(self, status: int, code: object, registered: Sequence[Mapping]):
        super().__init__(f"공고 등록이 HTTP {status}({code or '본문 없음'})로 실패했습니다")
        self.status = status
        self.code = code
        self.registered = tuple(registered)


class AdminClient:
    """품질 관리 비밀번호로 공고 관리 API를 부른다. Origin 헤더는 보내지 않는다(다른 Origin은 403)."""

    def __init__(self, base_url: str, password: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self._authorization = basic_authorization(password)
        self._timeout = timeout
        self._opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def __repr__(self) -> str:
        return f"AdminClient(base_url={self.base_url!r})"

    def register(self, payload: Mapping) -> ApiResult:
        request = urllib.request.Request(self.base_url + ADMIN_POSTINGS_PATH, data=json.dumps(payload).encode(), method="POST",
                                         headers={"Content-Type": "application/json", "Authorization": self._authorization})
        return self._send(request)

    def summary(self, start: dt.datetime, end: dt.datetime) -> ApiResult:
        """관리 API의 기간 요약. 구독 수(subscriptions)는 기간과 무관한 현재값이다."""
        query = urllib.parse.urlencode({"from": iso(start), "to": iso(end)})
        request = urllib.request.Request(f"{self.base_url}{ADMIN_SUMMARY_PATH}?{query}", method="GET",
                                         headers={"Authorization": self._authorization})
        return self._send(request)

    def _send(self, request: urllib.request.Request) -> ApiResult:
        started = time.monotonic()
        try:
            with self._opener.open(request, timeout=self._timeout) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        return ApiResult(status, _json_object(raw), (time.monotonic() - started) * 1000)


def _json_object(raw: bytes) -> dict:
    try:
        parsed = json.loads(raw or b"{}")
    except ValueError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def register_all(client: AdminClient, payloads: Sequence[Mapping], clock: Callable[[], float] = time.time) -> dict:
    """순서대로 등록한다. 201이 아니면 그때까지 등록한 공고를 담아 RegistrationError를 낸다."""
    started = clock()
    postings: list[dict] = []
    for number, payload in enumerate(payloads, start=1):
        result = client.register(payload)
        if result.status != 201:
            raise RegistrationError(result.status, result.body.get("error"), postings)
        if not _registered_body(result.body):
            raise RegistrationError(result.status, "UNEXPECTED_RESPONSE", postings)
        postings.append({"number": number, "id": result.body["id"], "link": payload["link"], "scheduledAt": result.body["scheduledAt"],
                         "deliveries": result.body["deliveries"], "registerMs": round(result.elapsed_ms, 1)})
    finished = clock()
    return {"startedAt": _iso_epoch(started), "finishedAt": _iso_epoch(finished), "durationMs": round((finished - started) * 1000, 1),
            "postings": postings}


def _registered_body(body: Mapping) -> bool:
    """201 본문에 공고 id, 예정 시각, 발송 문서 수가 있는지. 없으면 등록은 됐을 수 있으므로 관리 화면에서 확인하게 한다."""
    deliveries = body.get("deliveries")
    return (isinstance(body.get("id"), str) and bool(body["id"]) and isinstance(body.get("scheduledAt"), str)
            and isinstance(deliveries, int) and not isinstance(deliveries, bool) and deliveries >= 0)


def _iso_epoch(seconds: float) -> str:
    return iso(dt.datetime.fromtimestamp(seconds, dt.timezone.utc))


def late_warning(finished_at: dt.datetime, opens_at: dt.datetime) -> str | None:
    late = (finished_at - opens_at).total_seconds()
    if late < 0:
        return None
    return f"등록이 예정 시각보다 {late:.1f}초 늦게 끝났습니다. 등록 CPU가 버스트 측정에 섞이므로 --opens-in-seconds를 늘려 다시 재세요"
