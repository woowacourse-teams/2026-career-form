#!/usr/bin/env python3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.lib.cli import print_result
from harness.lib.commit_message import validate_commit_message


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: validate-commit-message <메시지 파일>", file=sys.stderr)
        return 2
    try:
        message = Path(sys.argv[1]).read_text(encoding="utf-8")
    except OSError as error:
        print(f"커밋 메시지를 읽을 수 없습니다: {error}", file=sys.stderr)
        return 2
    return print_result(validate_commit_message(message))


if __name__ == "__main__":
    raise SystemExit(main())
