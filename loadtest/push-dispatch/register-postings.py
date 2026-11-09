"""같은 예정 시각의 시험 공고 N건을 관리 API로 등록하고 실행 기록(run.json)에 남긴다.

링크는 `https://loadtest.invalid/<실행 id>/<번호>`, 직무 기본값은 분류 전체다. 대상 DB에 시험 표지가 없는 구독이
있으면 등록 요청을 하나도 보내지 않고 멈춘다(종료 코드 3). 등록이 예정 시각 전에 끝나지 않으면 경고한다.

환경변수: LOADTEST_MONGODB_URI(안전장치 확인용), LOADTEST_ADMIN_PASSWORD
예: python register-postings.py --run-dir runs/20261109T101500Z-s1 --count 1 --note commit=$(git rev-parse --short HEAD)
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
import time
from collections.abc import Mapping, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pushload import cli, runfiles  # noqa: E402
from pushload.categories import role_codes  # noqa: E402
from pushload.postings import AdminClient, RegistrationError, late_warning, register_all, registration_payload  # noqa: E402
from pushload.safety import ForeignSubscriptionsError, ensure_only_test_subscriptions  # noqa: E402


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="공고 알림 시험 공고 등록")
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--api", default="http://127.0.0.1:18080", help="백엔드 주소")
    parser.add_argument("--opens-in-seconds", type=int, default=120, help="지금부터 예정 시각까지(초)")
    parser.add_argument("--closes-in-days", type=int, default=7)
    parser.add_argument("--roles", default="", help="쉼표로 구분한 소분류 코드. 비우면 분류 전체")
    parser.add_argument("--note", action="append", default=[], help="실행 메모 key=value(커밋 SHA, 발송 설정값 등)")
    parser.add_argument("--timeout", type=float, default=30.0)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] = os.environ, connect=cli.connect_database,
         clock=time.time) -> int:
    args = parse_args(argv)
    run_dir = Path(args.run_dir)
    try:
        uri = cli.require_env(environ, "LOADTEST_MONGODB_URI")
        password = cli.require_env(environ, "LOADTEST_ADMIN_PASSWORD")
        run_id = runfiles.validate_run_id(run_dir.name)
        roles = _roles(args.roles)
        notes = cli.parse_notes(args.note)
        if args.count < 1 or args.opens_in_seconds < 0 or args.closes_in_days < 1:
            raise cli.UsageError("--count, --closes-in-days는 1 이상, --opens-in-seconds는 0 이상이어야 합니다")
        ensure_only_test_subscriptions(connect(uri).push_subscriptions)
    except (cli.UsageError, ValueError) as error:
        print(f"입력 오류: {error}", file=sys.stderr)
        return cli.EXIT_USAGE
    except ForeignSubscriptionsError as error:
        print(error, file=sys.stderr)
        return cli.EXIT_UNSAFE
    return _register(args, run_dir, run_id, roles, notes, AdminClient(args.api, password, args.timeout), clock)


def _roles(text: str) -> tuple[str, ...]:
    codes = role_codes()
    if not text.strip():
        return codes
    roles = tuple(dict.fromkeys(code.strip() for code in text.split(",") if code.strip()))
    unknown = [code for code in roles if code not in codes]
    if not roles or unknown:
        raise cli.UsageError(f"모르는 직무 코드입니다: {', '.join(unknown) or '(비어 있음)'}")
    return roles


def _register(args, run_dir: Path, run_id: str, roles: Sequence[str], notes: Mapping[str, str], client: AdminClient, clock) -> int:
    now = dt.datetime.fromtimestamp(clock(), dt.timezone.utc).replace(microsecond=0)
    opens_at = now + dt.timedelta(seconds=args.opens_in_seconds)
    closes_at = opens_at + dt.timedelta(days=args.closes_in_days)
    payloads = [registration_payload(run_id, number, roles, opens_at, closes_at) for number in range(1, args.count + 1)]
    section = {"api": args.api, "count": args.count, "opensAt": runfiles.iso(opens_at), "closesAt": runfiles.iso(closes_at),
               "roles": "all" if tuple(roles) == role_codes() else list(roles), "notes": dict(notes)}
    try:
        report = register_all(client, payloads, clock)
    except RegistrationError as error:
        _save(run_dir, run_id, {**section, "items": list(error.registered), "error": {"status": error.status, "code": error.code}})
        print(f"{error}. 등록한 {len(error.registered)}건은 run.json에 남겼습니다", file=sys.stderr)
        return cli.EXIT_FAILURE
    except OSError as error:
        _save(run_dir, run_id, {**section, "items": [], "error": {"status": None, "code": type(error).__name__}})
        print(f"관리 API에 연결하지 못했습니다: {type(error).__name__}", file=sys.stderr)
        return cli.EXIT_FAILURE
    warning = late_warning(runfiles.parse_iso(report["finishedAt"]), opens_at)
    registration = {key: report[key] for key in ("startedAt", "finishedAt", "durationMs")}
    _save(run_dir, run_id, {**section, "registration": registration, "items": report["postings"], "warnings": [warning] if warning else []})
    deliveries = sum(posting["deliveries"] for posting in report["postings"])
    print(f"공고 {args.count}건을 등록했습니다. 예정 시각 {runfiles.iso(opens_at)}, 발송 문서 {deliveries}건, 등록 {report['durationMs']:.0f}ms")
    if warning:
        print(f"경고: {warning}", file=sys.stderr)
    return cli.EXIT_OK


def _save(run_dir: Path, run_id: str, section: Mapping) -> None:
    run = runfiles.with_section({**runfiles.read_run(run_dir), "runId": run_id}, "postings", dict(section))
    runfiles.write_run(run_dir, run)


if __name__ == "__main__":
    raise SystemExit(main())
