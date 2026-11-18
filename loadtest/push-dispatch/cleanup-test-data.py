"""시험 표지가 있는 구독(endpoint `/fcm/send/loadtest-`)·공고(링크 `https://loadtest.invalid/`)와 그 발송 문서만 지운다.

기본은 지울 건수만 보여 준다. `--yes`일 때만 지운다.

환경변수: LOADTEST_MONGODB_URI
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pushload import cleanup, cli  # noqa: E402


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="공고 알림 시험 데이터 정리")
    parser.add_argument("--yes", action="store_true", help="건수 확인 뒤 실제로 지운다")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] = os.environ, connect=cli.connect_database) -> int:
    args = parse_args(argv)
    try:
        database = connect(cli.require_env(environ, "LOADTEST_MONGODB_URI"))
    except cli.UsageError as error:
        print(f"입력 오류: {error}", file=sys.stderr)
        return cli.EXIT_USAGE
    target = cleanup.plan(database)
    print(f"지울 대상: 구독 {len(target.subscription_ids)}개, 공고 {len(target.posting_ids)}건, 발송 문서 {target.deliveries}건")
    if not args.yes:
        print("지우려면 --yes를 붙여 다시 실행하세요")
        return cli.EXIT_OK
    deleted = cleanup.execute(database, target)
    print(f"지웠습니다: 구독 {deleted['subscriptions']}개, 공고 {deleted['postings']}건, 발송 문서 {deleted['deliveries']}건")
    return cli.EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
