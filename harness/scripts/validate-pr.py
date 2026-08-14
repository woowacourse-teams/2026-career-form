#!/usr/bin/env python3
import sys
from collections.abc import Mapping
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
        linked_issue_title, linked_issue_labels = (
            _linked_issue(sys.argv[2]) if len(sys.argv) == 3 else (None, ())
        )
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    return print_result(
        validate_pr(payload, linked_issue_title, linked_issue_labels)
    )


def _linked_issue(path: str) -> tuple[str, tuple[str, ...]]:
    payload = read_json(path)
    title = payload.get("title")
    if not isinstance(title, str) or not title.strip():
        raise ValueError("연결 Issue 제목이 필요합니다")
    labels = payload.get("labels", [])
    if not isinstance(labels, list):
        raise ValueError("연결 Issue labels는 배열이어야 합니다")
    return title, tuple(_label_name(label) for label in labels)


def _label_name(label: object) -> str:
    if not isinstance(label, Mapping):
        raise ValueError("연결 Issue labels 항목은 객체여야 합니다")
    name = label.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("연결 Issue labels[].name이 필요합니다")
    return name


if __name__ == "__main__":
    raise SystemExit(main())
