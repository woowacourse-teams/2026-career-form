#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.lib.cli import labels_from_payload, nested_payload, print_result, read_json
from harness.lib.shared_files import closing_issue_numbers, validate_shared_file_change


def linked_issue_labels(payload: Mapping[str, object]) -> tuple[str, ...]:
    pull_request = nested_payload(payload, "pull_request")
    body = pull_request.get("body")
    if not isinstance(body, str):
        return ()

    labels: list[str] = []
    repository = os.environ.get("GITHUB_REPOSITORY")
    for number in closing_issue_numbers(body):
        command = ["gh", "issue", "view", str(number), "--json", "labels"]
        if repository:
            command.extend(("--repo", repository))
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        if completed.returncode != 0:
            raise ValueError(f"연결 Issue #{number}을 조회할 수 없습니다")
        value = json.loads(completed.stdout)
        issue_labels = value.get("labels") if isinstance(value, Mapping) else None
        if isinstance(issue_labels, Sequence) and not isinstance(issue_labels, str):
            labels.extend(
                name
                for label in issue_labels
                if isinstance(label, Mapping)
                and isinstance((name := label.get("name")), str)
            )
    return tuple(labels)


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "사용법: validate-shared-files <경로 목록> <GitHub 이벤트 JSON>",
            file=sys.stderr,
        )
        return 2
    try:
        paths = tuple(
            path
            for path in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
            if path
        )
        payload = read_json(sys.argv[2])
        labels = labels_from_payload(payload)
        issue_labels = linked_issue_labels(payload)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"공유 파일 검사 입력을 읽을 수 없습니다: {error}", file=sys.stderr)
        return 2
    return print_result(validate_shared_file_change(paths, labels, issue_labels))


if __name__ == "__main__":
    raise SystemExit(main())
