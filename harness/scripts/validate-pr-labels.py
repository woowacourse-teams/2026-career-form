#!/usr/bin/env python3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import print_result, read_json
from harness.lib.pr_labels import validate_pr_labels


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "사용법: validate-pr-labels <Issue JSON> <PR JSON>",
            file=sys.stderr,
        )
        return 2
    try:
        issue = read_json(sys.argv[1])
        pull_request = read_json(sys.argv[2])
        result = validate_pr_labels(issue, pull_request)
    except ValueError as error:
        print(f"PR 라벨 입력을 읽을 수 없습니다: {error}", file=sys.stderr)
        return 2
    return print_result(result)


if __name__ == "__main__":
    raise SystemExit(main())
