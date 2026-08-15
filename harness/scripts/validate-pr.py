#!/usr/bin/env python3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.lib.cli import nested_payload, print_result, read_json
from harness.lib.pr_contract import validate_pr


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print(
            "사용법: validate-pr <GitHub 이벤트 JSON> [연결 Issue JSON]",
            file=sys.stderr,
        )
        return 2
    try:
        payload = nested_payload(read_json(sys.argv[1]), "pull_request")
        linked_issue_title = _linked_issue(sys.argv[2]) if len(sys.argv) == 3 else None
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    return print_result(
        validate_pr(payload, linked_issue_title)
    )


def _linked_issue(path: str) -> str:
    payload = read_json(path)
    title = payload.get("title")
    if not isinstance(title, str) or not title.strip():
        raise ValueError("연결 Issue 제목이 필요합니다")
    return title


if __name__ == "__main__":
    raise SystemExit(main())
