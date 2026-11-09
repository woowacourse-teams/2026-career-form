"""공고 알림 시험용 모의 푸시 서버를 띄운다. 표준 라이브러리만 쓴다.

예: python mock-push-server.py --host 0.0.0.0 --port 8080 --log runs/<id>/requests.jsonl
기본값은 환경변수 MOCK_DELAY_MS(100), MOCK_STATUSES(201=1), MOCK_RETRY_AFTER_SECONDS(60)에서 읽는다.
"""

from __future__ import annotations

import argparse
import os
import random
import signal
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pushload.mock_server import MockState, RequestLog, build_server, make_config  # noqa: E402


def parse_args(argv: Sequence[str] | None, environ: Mapping[str, str] = os.environ) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="공고 알림 시험용 모의 푸시 서버")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--log", required=True, help="요청 기록 JSONL 경로")
    # 기본값을 문자열로 두면 argparse가 type으로 바꾸며 검사한다. 잘못된 환경변수는 사용법 오류(종료 코드 2)가 된다.
    parser.add_argument("--delay-ms", type=int, default=environ.get("MOCK_DELAY_MS", "100"))
    parser.add_argument("--statuses", default=environ.get("MOCK_STATUSES", "201=1"))
    parser.add_argument("--retry-after-seconds", type=int, default=environ.get("MOCK_RETRY_AFTER_SECONDS", "60"))
    parser.add_argument("--seed", type=int, default=None, help="상태 선택 난수 시드")
    return parser.parse_args(argv)


def _stop(signum, frame):
    raise KeyboardInterrupt


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        config = make_config(args.delay_ms, args.statuses, args.retry_after_seconds)
    except ValueError as error:
        print(f"설정 오류: {error}", file=sys.stderr)
        return 2
    log = RequestLog(args.log)
    server = build_server(args.host, args.port, MockState(config), log, random.Random(args.seed))
    signal.signal(signal.SIGTERM, _stop)
    print(f"모의 푸시 서버 시작: {args.host}:{server.server_address[1]} 지연 {config.delay_ms}ms 상태 {config.statuses.text}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        log.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
