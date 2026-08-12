import json
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

from harness.lib.result import ValidationResult


def read_json(path: str) -> Mapping[str, object]:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"JSON 입력을 읽을 수 없습니다: {error}") from error
    if not isinstance(value, Mapping):
        raise ValueError("JSON 입력은 객체여야 합니다")
    return value


def nested_payload(
    payload: Mapping[str, object], key: str
) -> Mapping[str, object]:
    value = payload.get(key, payload)
    if not isinstance(value, Mapping):
        raise ValueError(f"{key} 입력은 객체여야 합니다")
    return value


def print_result(result: ValidationResult) -> int:
    if result.is_valid:
        return 0
    for error in result.errors:
        print(f"오류: {error}", file=sys.stderr)
    return 1


def current_branch(cwd: object = None) -> str:
    directory = cwd if isinstance(cwd, str) else None
    try:
        completed = subprocess.run(
            ("git", "branch", "--show-current"),
            cwd=directory,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as error:
        raise RuntimeError("현재 브랜치를 확인할 수 없습니다") from error
    branch = completed.stdout.strip()
    if completed.returncode != 0 or not branch:
        raise RuntimeError("현재 브랜치를 확인할 수 없습니다")
    return branch


def labels_from_payload(payload: Mapping[str, object]) -> tuple[str, ...]:
    pull_request = nested_payload(payload, "pull_request")
    labels = pull_request.get("labels")
    if not isinstance(labels, Sequence) or isinstance(labels, str):
        return ()
    return tuple(
        name
        for label in labels
        if isinstance(label, Mapping)
        and isinstance((name := label.get("name")), str)
    )
