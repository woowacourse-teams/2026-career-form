from collections.abc import Mapping, Sequence

from harness.lib.cli import nested_payload
from harness.lib.result import ValidationResult


CHANGE_LABELS = frozenset(
    (
        "frontend-change",
        "backend-change",
        "infra-change",
        "harness-change",
    )
)


def select_pr_labels(payload: Mapping[str, object]) -> tuple[str, ...]:
    names = _label_names(payload, "issue")
    selected = (
        name
        for name in names
        if name.startswith("type:") or name in CHANGE_LABELS
    )
    return tuple(dict.fromkeys(selected))


def validate_pr_labels(
    issue_payload: Mapping[str, object],
    pr_payload: Mapping[str, object],
) -> ValidationResult:
    expected = select_pr_labels(issue_payload)
    actual = _label_names(pr_payload, "pull_request")
    missing = tuple(name for name in expected if name not in actual)
    forbidden = tuple(name for name in actual if name.startswith("status:"))
    errors: list[str] = []
    if missing:
        errors.append(
            f"PR에 필요한 변경 분류 라벨이 없습니다: {', '.join(missing)}"
        )
    if forbidden:
        errors.append(
            f"PR에는 Issue 상태 라벨을 적용할 수 없습니다: {', '.join(forbidden)}"
        )
    return ValidationResult(tuple(errors))


def _label_names(
    payload: Mapping[str, object],
    key: str,
) -> tuple[str, ...]:
    value = nested_payload(payload, key)
    labels = value.get("labels")
    if not isinstance(labels, Sequence) or isinstance(labels, str):
        raise ValueError("labels는 목록이어야 합니다")
    return tuple(_label_name(label) for label in labels)


def _label_name(value: object) -> str:
    if not isinstance(value, Mapping):
        raise ValueError("label은 객체여야 합니다")
    name = value.get("name")
    if not isinstance(name, str) or not name:
        raise ValueError("label name은 문자열이어야 합니다")
    return name
