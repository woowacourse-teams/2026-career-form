"""시험 구독을 만들어 시험 전용 MongoDB의 push_subscriptions에 넣는다.

endpoint는 모의 푸시 서버(`http://<host>/fcm/send/loadtest-<실행 id>-...`)를 가리키고, 복호화용 비공개키는
실행 폴더의 subscriber-keys.jsonl(권한 600)에만 남긴다. 대상 DB에 시험 표지가 없는 구독이 하나라도 있으면
아무것도 쓰지 않고 멈춘다(종료 코드 3).

환경변수: LOADTEST_MONGODB_URI
예: python generate-subscriptions.py --run-dir runs/20261109T101500Z-s1 --count 30000
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import random
import sys
import time
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pushload import cli, runfiles, subscriptions  # noqa: E402
from pushload.categories import role_codes  # noqa: E402
from pushload.safety import ForeignSubscriptionsError, ensure_only_test_subscriptions  # noqa: E402

INSERT_BATCH = 1_000


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="공고 알림 시험 구독 생성")
    parser.add_argument("--run-dir", required=True, help="실행 폴더. 폴더 이름이 실행 id다")
    parser.add_argument("--count", type=int, default=1_000)
    parser.add_argument("--mock-base", default="http://mock-push:8080", help="백엔드가 모의 서버에 닿는 주소")
    parser.add_argument("--unselected-ratio", type=float, default=0.3, help="직무를 고르지 않은 구독 비율")
    parser.add_argument("--endpoint-length", type=int, default=subscriptions.DEFAULT_ENDPOINT_LENGTH)
    parser.add_argument("--seed", type=int, default=441, help="직무 배정 시드. 전후 측정에 같은 값을 쓴다")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] = os.environ, connect=cli.connect_database) -> int:
    args = parse_args(argv)
    run_dir = Path(args.run_dir)
    try:
        uri = cli.require_env(environ, "LOADTEST_MONGODB_URI")
        run_id = runfiles.validate_run_id(run_dir.name)
        if args.count < 1:
            raise cli.UsageError("--count는 1 이상이어야 합니다")
        if (run_dir / runfiles.KEYS_FILE).exists():
            raise cli.UsageError("이 실행 폴더에는 이미 키 파일이 있습니다. 새 실행 폴더를 쓰세요")
        codes = role_codes()
        database = connect(uri)
        ensure_only_test_subscriptions(database.push_subscriptions)
    except (cli.UsageError, ValueError) as error:
        print(f"입력 오류: {error}", file=sys.stderr)
        return cli.EXIT_USAGE
    except ForeignSubscriptionsError as error:
        print(error, file=sys.stderr)
        return cli.EXIT_UNSAFE
    return _generate(args, run_dir, run_id, codes, database.push_subscriptions)


def _generate(args: argparse.Namespace, run_dir: Path, run_id: str, codes: Sequence[str], collection) -> int:
    run_dir.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    pairs = subscriptions.generate(args.count, mock_base=args.mock_base, run_id=run_id, codes=codes, unselected_ratio=args.unselected_ratio,
                                   endpoint_length=args.endpoint_length, rng=random.Random(args.seed), now=now)
    selected = _insert(collection, run_dir / runfiles.KEYS_FILE, pairs)
    section = {"count": args.count, "selected": selected, "unselected": args.count - selected, "unselectedRatio": args.unselected_ratio,
               "seed": args.seed, "mockBase": args.mock_base, "endpointLength": args.endpoint_length, "registeredAt": runfiles.iso(now),
               "durationMs": round((time.monotonic() - started) * 1000, 1)}
    run = runfiles.with_section({**runfiles.read_run(run_dir), "runId": run_id}, "subscriptions", section)
    runfiles.write_run(run_dir, run)
    print(f"시험 구독 {args.count}개를 넣었습니다(직무 선택 {selected}, 미선택 {args.count - selected}). 키 파일: {run_dir / runfiles.KEYS_FILE}")
    return cli.EXIT_OK


def _insert(collection, keys_path: Path, pairs: Iterable[tuple[dict, dict]]) -> int:
    """키 기록을 먼저 쓰고 같은 묶음의 문서를 넣는다. DB에 있는 시험 구독은 언제나 키가 남아 있다."""
    selected = 0
    batch: list[dict] = []
    descriptor = os.open(keys_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as keys_file:
        for document, record in pairs:
            keys_file.write(json.dumps(record) + "\n")
            selected += "roles" in document
            batch.append(document)
            if len(batch) == INSERT_BATCH:
                keys_file.flush()
                collection.insert_many(batch, ordered=True)
                batch = []
        keys_file.flush()
        if batch:
            collection.insert_many(batch, ordered=True)
    return selected


if __name__ == "__main__":
    raise SystemExit(main())
