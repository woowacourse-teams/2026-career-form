import re
from collections.abc import Mapping

from harness.lib.branching import (
    is_release_branch,
    is_revert_branch,
    is_system_pr,
    issue_number_from_branch,
    validate_branch_flow,
)
from harness.lib.markdown_sections import extract_sections, extract_subsections
from harness.lib.result import ValidationResult, merge_results
from harness.lib.work_title import validate_release_title, validate_work_title


REQUIRED_SECTIONS = (
    "무엇이 바뀌었나요?",
    "왜 바꿨나요?",
    "어떻게 바꿨나요?",
    "기존 기능에 미치는 영향",
    "검토한 대안과 선택 이유",
    "리뷰 포인트",
)
REQUIRED_VERIFICATION_SECTIONS = ("자동 검증", "수동 검증")
CLOSE_REFERENCE_PATTERN = re.compile(
    r"(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+"
    r"(?:(?P<repository>[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+))?"
    r"#(?P<issue>[1-9][0-9]*)\b"
)
HTML_COMMENT_PATTERN = re.compile(r"<!--.*?-->", re.DOTALL)
FENCE_OPEN_PATTERN = re.compile(
    r"^[ \t]{0,3}(?P<fence>`{3,}|~{3,})[^\n]*$",
)
INLINE_CODE_PATTERN = re.compile(r"(?P<ticks>`+).*?(?P=ticks)", re.DOTALL)
INDENTED_CODE_PATTERN = re.compile(r"^(?: {4}|\t).*$", re.MULTILINE)
DETAILS_PATTERN = re.compile(
    r"<details>\s*<summary>\s*(?P<name>[^<\n]+?)\s*</summary>"
    r"(?P<body>.*?)</details>",
    re.DOTALL | re.IGNORECASE,
)


def validate_pr(
    payload: Mapping[str, object],
    linked_issue_title: str | None = None,
) -> ValidationResult:
    title = payload.get("title")
    body = payload.get("body")
    head = _branch_ref(payload.get("head"))
    base = _branch_ref(payload.get("base"))
    base_repository = _base_repository(payload.get("base"))

    if not isinstance(title, str) or not isinstance(body, str):
        return ValidationResult(("PR 제목과 본문이 필요합니다",))
    if head is None or base is None:
        return ValidationResult(("PR head와 base 브랜치가 필요합니다",))

    system_pr = is_system_pr(head, base)
    title_result = (
        validate_release_title(title) if system_pr else validate_work_title(title)
    )
    results = [title_result, validate_branch_flow(head, base)]
    results.append(_validate_revert_draft(payload, head, base))
    prose = _markdown_prose(body)
    sections = extract_sections(prose)
    errors = tuple(
        f"PR 필수 섹션이 없습니다: {name}"
        for name in REQUIRED_SECTIONS
        if name not in sections or not sections[name]
    )
    if all(name in sections for name in REQUIRED_SECTIONS):
        section_order = tuple(name for name in sections if name in REQUIRED_SECTIONS)
        if section_order != REQUIRED_SECTIONS:
            errors += ("PR 필수 섹션 순서가 올바르지 않습니다",)
    errors += (
        _validate_verification_record(
            prose,
            sections.get(REQUIRED_SECTIONS[-1]),
        )
    )

    results.append(ValidationResult(tuple(errors)))
    if not system_pr and linked_issue_title is not None and title != linked_issue_title:
        results.append(
            ValidationResult(("PR 제목은 연결 Issue 제목과 같아야 합니다",))
        )
    results.append(
        _validate_closing_references(
            body=body,
            head=head,
            system_pr=system_pr,
            base_repository=base_repository,
        )
    )
    return merge_results(*results)


def _validate_verification_record(
    body: str,
    review_section: str | None,
) -> tuple[str, ...]:
    records = tuple(
        match
        for match in DETAILS_PATTERN.finditer(body)
        if match.group("name").strip() == "검증 기록"
    )
    if not records:
        return ("PR 검증 기록이 필요합니다",)
    if len(records) > 1:
        return ("PR 검증 기록은 하나만 작성해야 합니다",)
    if review_section is not None and records[0].group(0) not in review_section:
        return ("PR 검증 기록은 리뷰 섹션 뒤에 있어야 합니다",)

    sections = extract_subsections(records[0].group("body"))
    return tuple(
        f"PR 검증 기록이 없습니다: {name}"
        for name in REQUIRED_VERIFICATION_SECTIONS
        if name not in sections or not sections[name]
    )


def _validate_closing_references(
    *,
    body: str,
    head: str,
    system_pr: bool,
    base_repository: str | None,
) -> ValidationResult:
    close_matches = tuple(
        CLOSE_REFERENCE_PATTERN.finditer(_markdown_prose(body))
    )
    errors: list[str] = []
    if system_pr and close_matches:
        errors.append("시스템 PR은 Issue를 종료하지 않습니다")
    elif not close_matches and not system_pr:
        errors.append("PR은 Closes #<Issue 번호>를 포함해야 합니다")
    elif len(close_matches) > 1 and not system_pr:
        errors.append("PR은 하나의 Issue만 종료해야 합니다")
    elif not system_pr:
        branch_issue = issue_number_from_branch(head)
        referenced_repository = close_matches[0].group("repository")
        if (
            branch_issue is not None
            and (
                (
                    referenced_repository is not None
                    and (
                        base_repository is None
                        or referenced_repository.casefold()
                        != base_repository.casefold()
                    )
                )
                or branch_issue != close_matches[0].group("issue")
            )
        ):
            errors.append("브랜치의 Issue 번호와 PR이 종료하는 Issue 번호가 다릅니다")
    return ValidationResult(tuple(errors))


def _validate_revert_draft(
    payload: Mapping[str, object], head: str, base: str
) -> ValidationResult:
    if is_revert_branch(head) and base == "main" and payload.get("draft") is not True:
        return ValidationResult(("되돌림 PR은 Draft 상태여야 합니다",))
    return ValidationResult()


def _markdown_prose(body: str) -> str:
    without_comments = HTML_COMMENT_PATTERN.sub("", body)
    without_fences = _without_fenced_code(without_comments)
    without_inline_code = INLINE_CODE_PATTERN.sub("", without_fences)
    return INDENTED_CODE_PATTERN.sub("", without_inline_code)


def _without_fenced_code(body: str) -> str:
    output: tuple[str, ...] = ()
    fence_character: str | None = None
    fence_length = 0
    for line in body.splitlines(keepends=True):
        content = line.rstrip("\r\n")
        if fence_character is None:
            match = FENCE_OPEN_PATTERN.match(content)
            if match is None:
                output += (line,)
                continue
            fence = match.group("fence")
            fence_character = fence[0]
            fence_length = len(fence)
            continue
        close_pattern = rf"^[ \t]{{0,3}}{re.escape(fence_character)}{{{fence_length},}}[ \t]*$"
        if re.match(close_pattern, content) is not None:
            fence_character = None
            fence_length = 0
    return "".join(output)


def _branch_ref(value: object) -> str | None:
    if not isinstance(value, Mapping):
        return None
    ref = value.get("ref")
    return ref if isinstance(ref, str) else None


def _base_repository(value: object) -> str | None:
    if not isinstance(value, Mapping):
        return None
    repository = value.get("repo")
    if not isinstance(repository, Mapping):
        return None
    full_name = repository.get("full_name")
    return full_name if isinstance(full_name, str) else None
