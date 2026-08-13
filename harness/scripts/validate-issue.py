#!/usr/bin/env python3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.lib.cli import print_result, read_json
from harness.lib.issue_contract import validate_issue_event


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: validate-issue <GitHub 이벤트 JSON>", file=sys.stderr)
        return 2
    try:
        payload = read_json(sys.argv[1])
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    return print_result(validate_issue_event(payload))


if __name__ == "__main__":
    raise SystemExit(main())
