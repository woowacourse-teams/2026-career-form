import re
from collections.abc import Mapping

from harness.lib.branching import issue_number_from_branch, validate_branch_flow
from harness.lib.markdown_sections import extract_sections
from harness.lib.result import ValidationResult, merge_results
from harness.lib.work_title import validate_release_title, validate_work_title


REQUIRED_SECTIONS = (
    "변경 요약",
    "인수 조건 충족 근거",
    "자동 검증",
    "수동 확인",
    "제외 범위 및 후속 작업",
    "롤백",
)
CLOSE_PATTERN = re.compile(r"(?im)^Closes\s+#(?P<issue>[1-9][0-9]*)\s*$")


def validate_pr(payload: Mapping[str, object]) -> ValidationResult:
    title = payload.get("title")
    body = payload.get("body")
    head = _branch_ref(payload.get("head"))
    base = _branch_ref(payload.get("base"))

    if not isinstance(title, str) or not isinstance(body, str):
        return ValidationResult(("PR 제목과 본문이 필요합니다",))
    if head is None or base is None:
        return ValidationResult(("PR head와 base 브랜치가 필요합니다",))

    release_pr = (head, base) == ("develop", "main")
    title_result = (
        validate_release_title(title) if release_pr else validate_work_title(title)
    )
    results = [title_result, validate_branch_flow(head, base)]
    errors: list[str] = []
    sections = extract_sections(body)
    for name in REQUIRED_SECTIONS:
        if name not in sections or not sections[name]:
            errors.append(f"PR 필수 섹션이 없습니다: {name}")

    close_match = CLOSE_PATTERN.search(body)
    if close_match is None and not release_pr:
        errors.append("PR은 Closes #<Issue 번호>를 포함해야 합니다")
    elif close_match is not None and not release_pr:
        branch_issue = issue_number_from_branch(head)
        if branch_issue is not None and branch_issue != close_match.group("issue"):
            errors.append("브랜치의 Issue 번호와 PR이 종료하는 Issue 번호가 다릅니다")

    results.append(ValidationResult(tuple(errors)))
    return merge_results(*results)


def _branch_ref(value: object) -> str | None:
    if not isinstance(value, Mapping):
        return None
    ref = value.get("ref")
    return ref if isinstance(ref, str) else None
