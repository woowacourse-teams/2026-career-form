"""같은 예정 시각의 시험 공고 N건을 관리 API로 등록하고 실행 기록(run.json)에 남긴다.

링크는 `https://loadtest.invalid/<실행 id>/<번호>`, 직무 기본값은 분류 전체다. 대상 DB에 시험 표지가 없는 구독이
있으면 등록 요청을 하나도 보내지 않고 멈춘다(종료 코드 3). 등록이 예정 시각 전에 끝나지 않으면 경고한다.

환경변수: LOADTEST_MONGODB_URI(안전장치 확인용), LOADTEST_ADMIN_PASSWORD
등록 전에 관리 API가 보는 구독 수와 안전장치가 확인한 DB의 구독 수를 대조해, 둘이 같은 시험 스택인지 확인한다.
저장소 커밋(git rev-parse HEAD)과 변경 여부는 실행 기록에 자동으로 남긴다.

예: python register-postings.py --run-dir runs/20261109T101500Z-s1 --count 30 --note host=c7g.large
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import subprocess
import sys
import time
from collections.abc import Mapping, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pushload import cli, runfiles  # noqa: E402
from pushload.categories import role_codes  # noqa: E402
from pushload.postings import AdminClient, RegistrationError, late_warning, register_all, registration_payload  # noqa: E402
from pushload.safety import ForeignSubscriptionsError, TargetMismatchError, ensure_only_test_subscriptions, ensure_same_target  # noqa: E402


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="공고 알림 시험 공고 등록")
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--api", default="http://127.0.0.1:28080", help="시험 스택 백엔드 주소")
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
        database = connect(uri)
        ensure_only_test_subscriptions(database.push_subscriptions)
        client = AdminClient(args.api, password, args.timeout)
        _ensure_api_uses_database(client, database, clock)
    except (cli.UsageError, ValueError) as error:
        print(f"입력 오류: {error}", file=sys.stderr)
        return cli.EXIT_USAGE
    except (ForeignSubscriptionsError, TargetMismatchError) as error:
        print(error, file=sys.stderr)
        return cli.EXIT_UNSAFE
    except RegistrationError as error:
        print(f"관리 API 확인이 HTTP {error.status}({error.code or '본문 없음'})로 실패해 등록하지 않았습니다", file=sys.stderr)
        return cli.EXIT_FAILURE
    except OSError as error:
        print(f"관리 API에 연결하지 못했습니다: {type(error).__name__}", file=sys.stderr)
        return cli.EXIT_FAILURE
    return _register(args, run_dir, run_id, roles, notes, client, clock)


def _ensure_api_uses_database(client: AdminClient, database, clock) -> None:
    """관리 API의 요약이 보는 구독 수와 안전장치가 본 DB의 구독 수가 같아야 등록한다."""
    now = dt.datetime.fromtimestamp(clock(), dt.timezone.utc)
    result = client.summary(now - dt.timedelta(hours=1), now)
    if result.status != 200:
        raise RegistrationError(result.status, result.body.get("error"), ())
    ensure_same_target(result.body.get("subscriptions"), database.push_subscriptions.count_documents({}))


def _repository() -> dict:
    """측정한 커밋을 손으로 적다 틀리지 않게 저장소 HEAD와 변경 여부를 남긴다. git이 없으면 null."""
    here = Path(__file__).resolve().parent
    try:
        head = subprocess.run(["git", "-C", str(here), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10, check=True)
        status = subprocess.run(["git", "-C", str(here), "status", "--porcelain"], capture_output=True, text=True, timeout=10, check=True)
    except (OSError, subprocess.SubprocessError):
        return {"commit": None, "dirty": None}
    return {"commit": head.stdout.strip(), "dirty": bool(status.stdout.strip())}


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
               "roles": "all" if tuple(roles) == role_codes() else list(roles), "notes": dict(notes), "repository": _repository()}
    try:
        report = register_all(client, payloads, clock)
    except RegistrationError as error:
        runfiles.update_run(run_dir, run_id, "postings", {**section, "items": list(error.registered), "error": {"status": error.status, "code": error.code}})
        print(f"{error}. 등록한 {len(error.registered)}건은 run.json에 남겼습니다", file=sys.stderr)
        return cli.EXIT_FAILURE
    except OSError as error:
        runfiles.update_run(run_dir, run_id, "postings", {**section, "items": [], "error": {"status": None, "code": type(error).__name__}})
        print(f"관리 API에 연결하지 못했습니다: {type(error).__name__}", file=sys.stderr)
        return cli.EXIT_FAILURE
    warning = late_warning(runfiles.parse_iso(report["finishedAt"]), opens_at)
    registration = {key: report[key] for key in ("startedAt", "finishedAt", "durationMs")}
    runfiles.update_run(run_dir, run_id, "postings", {**section, "registration": registration, "items": report["postings"],
                                                      "warnings": [warning] if warning else []})
    deliveries = sum(posting["deliveries"] for posting in report["postings"])
    print(f"공고 {args.count}건을 등록했습니다. 예정 시각 {runfiles.iso(opens_at)}, 발송 문서 {deliveries}건, 등록 {report['durationMs']:.0f}ms")
    if warning:
        print(f"경고: {warning}", file=sys.stderr)
    return cli.EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
