"""실행 하나의 결과를 집계해 summary.json과 Markdown 표로 낸다.

입력: 실행 폴더의 run.json, subscriber-keys.jsonl, requests.jsonl(모의 서버 기록), resources.jsonl(자원 기록)과 MongoDB.
모의 서버가 받은 암호문을 시험 구독의 비공개키로 풀어 공고 id를 읽는다. 다른 실행의 요청은 경로로 걸러낸다.

환경변수: LOADTEST_MONGODB_URI(--without-mongo면 필요 없음)
예: python summarize-run.py --run-dir runs/20261109T101500Z-s1
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pushload import cli, runfiles  # noqa: E402
from pushload.report import build_summary, render_table  # noqa: E402
from pushload.webpush import SubscriberKeys  # noqa: E402


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="공고 알림 시험 결과 집계")
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--requests", help="모의 서버 기록. 기본은 <run-dir>/requests.jsonl")
    parser.add_argument("--resources", help="자원 기록. 기본은 <run-dir>/resources.jsonl")
    parser.add_argument("--without-mongo", action="store_true", help="MongoDB를 읽지 않는다(시험 스택을 내린 뒤 다시 집계할 때)")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] = os.environ, connect=cli.connect_database) -> int:
    args = parse_args(argv)
    run_dir = Path(args.run_dir)
    run = runfiles.read_run(run_dir)
    if not run.get("postings", {}).get("items"):
        print("입력 오류: run.json에 등록한 공고(postings.items)가 없습니다. register-postings.py를 먼저 실행하세요", file=sys.stderr)
        return cli.EXIT_USAGE
    try:
        database = None if args.without_mongo else connect(cli.require_env(environ, "LOADTEST_MONGODB_URI"))
    except cli.UsageError as error:
        print(f"입력 오류: {error}", file=sys.stderr)
        return cli.EXIT_USAGE
    key_records, skipped_keys = read_jsonl(run_dir / runfiles.KEYS_FILE)
    records, skipped_requests = read_jsonl(Path(args.requests) if args.requests else run_dir / runfiles.REQUESTS_FILE)
    samples, skipped_samples = read_jsonl(Path(args.resources) if args.resources else run_dir / runfiles.RESOURCES_FILE)
    keys_by_path = {record["path"]: (record["id"], SubscriberKeys.from_record(record)) for record in key_records}
    summary = build_summary(run, keys_by_path, records, samples, database, skipped_keys + skipped_requests + skipped_samples,
                            dt.datetime.now(dt.timezone.utc))
    (run_dir / runfiles.SUMMARY_FILE).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(render_table(summary))
    print(f"\n요약 파일: {run_dir / runfiles.SUMMARY_FILE}")
    return cli.EXIT_OK


def read_jsonl(path: Path) -> tuple[list[dict], int]:
    """JSONL을 읽는다. 파일이 없으면 빈 목록, 깨진 줄(쓰는 중 끊긴 마지막 줄 등)은 건너뛰고 수를 센다."""
    if not path.exists():
        return [], 0
    records, skipped = [], 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except ValueError:
            skipped += 1
    return records, skipped


if __name__ == "__main__":
    raise SystemExit(main())
