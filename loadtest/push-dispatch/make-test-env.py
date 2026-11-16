"""시험 스택 설정 파일(.env.loadtest)을 만든다.

시험용 VAPID 키 쌍, 임시 관리 비밀번호와 그 PBKDF2 검증 문자열, 로컬 시험 MongoDB 주소를 Git이 무시하는 파일에
권한 600으로 쓴다. 값은 화면에 출력하지 않는다. 파일이 이미 있으면 --force 없이는 덮어쓰지 않는다(종료 코드 2).

쓰는 법(loadtest/push-dispatch/에서):
  python make-test-env.py
  LOADTEST_RUN_DIR=runs/<실행 id> docker compose --env-file .env.loadtest up -d --build --wait
  set -a; . <(grep '^LOADTEST_' .env.loadtest); set +a    # 시험 스크립트에 필요한 LOADTEST_* 값만 셸에 내보낸다
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pushload import cli, testenv  # noqa: E402

DEFAULT_OUTPUT = Path(__file__).resolve().parent / ".env.loadtest"


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="공고 알림 시험 스택 설정 생성")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="쓸 파일 경로(기본: 이 스크립트 옆 .env.loadtest)")
    parser.add_argument("--force", action="store_true", help="이미 있는 파일을 새 값으로 바꾼다")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    output = Path(args.output)
    if output.exists() and not args.force:
        print(f"입력 오류: {output}가 이미 있습니다. 새 값으로 바꾸려면 --force를 붙이세요", file=sys.stderr)
        return cli.EXIT_USAGE
    if not output.parent.is_dir():
        print(f"입력 오류: 폴더가 없습니다: {output.parent}", file=sys.stderr)
        return cli.EXIT_USAGE
    values = testenv.loadtest_env_values()
    try:
        testenv.write_env_file(output, values, force=args.force)
    except FileExistsError:
        print(f"입력 오류: {output}가 이미 있습니다. 새 값으로 바꾸려면 --force를 붙이세요", file=sys.stderr)
        return cli.EXIT_USAGE
    print(f"시험 설정을 썼습니다(권한 600): {output}")
    print("변수: " + ", ".join(values))
    return cli.EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
