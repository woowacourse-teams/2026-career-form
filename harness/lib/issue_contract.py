import re
from collections.abc import Mapping

from harness.lib.markdown_sections import extract_sections
from harness.lib.result import ValidationResult
from harness.lib.work_title import validate_work_title


REQUIRED_SECTIONS = (
    "배경",
    "목표",
    "포함 범위",
    "제외 범위",
    "인수 조건",
    "자동 검증",
    "수동 검증",
    "위험 작업",
)
CHECKLIST_PATTERN = re.compile(r"(?m)^- \[[ xX]\]\s+\S")
FINALIZED_STATUS_LABELS = (
    "status:ready",
    "status:in-progress",
    "status:blocked",
    "status:review",
)


def validate_issue_event(event: Mapping[str, object]) -> ValidationResult:
    issue = event.get("issue")
    if not isinstance(issue, Mapping):
        return ValidationResult(("GitHub 이벤트에 Issue 정보가 없습니다",))

    action = event.get("action")
    if action == "edited":
        changes = event.get("changes")
        labels = _label_names(issue.get("labels"))
        body_changed = isinstance(changes, Mapping) and "body" in changes
        if body_changed and any(label in FINALIZED_STATUS_LABELS for label in labels):
            return ValidationResult(("ready 이후에는 Issue 본문을 수정할 수 없습니다",))
        return ValidationResult()

    label = event.get("label")
    if (
        action == "labeled"
        and isinstance(label, Mapping)
        and label.get("name") == "status:ready"
    ):
        return validate_issue(issue)
    return ValidationResult()


def validate_issue(payload: Mapping[str, object]) -> ValidationResult:
    title = payload.get("title")
    body = payload.get("body")
    labels = payload.get("labels")
    errors: list[str] = []

    if not isinstance(title, str):
        errors.append("Issue 제목이 필요합니다")
    else:
        errors.extend(validate_work_title(title).errors)
    if not isinstance(body, str):
        errors.append("Issue 본문이 필요합니다")
        return ValidationResult(tuple(errors))

    label_names = _label_names(labels)
    if "status:ready" not in label_names:
        errors.append("status:ready 라벨이 필요합니다")

    sections = extract_sections(body)
    for name in REQUIRED_SECTIONS:
        if name not in sections or not sections[name]:
            errors.append(f"필수 섹션이 없습니다: {name}")

    acceptance = sections.get("인수 조건", "")
    if CHECKLIST_PATTERN.search(acceptance) is None:
        errors.append("인수 조건에는 체크리스트가 필요합니다")

    return ValidationResult(tuple(errors))


def _label_names(labels: object) -> tuple[str, ...]:
    if not isinstance(labels, list):
        return ()
    return tuple(
        name
        for label in labels
        if isinstance(label, Mapping)
        and isinstance((name := label.get("name")), str)
    )
