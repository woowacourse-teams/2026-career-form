import re
from collections.abc import Mapping

from harness.lib.branching import issue_number_from_branch, validate_branch_flow
from harness.lib.markdown_sections import extract_sections
from harness.lib.result import ValidationResult, merge_results
from harness.lib.work_title import validate_release_title, validate_work_title


REQUIRED_SECTIONS = (
    "해결하려는 문제가 무엇인가요?",
    "왜 해야 하나요?",
    "어떻게 해결했나요?",
    "이 PR의 한계 & 트레이드오프",
    "기존 기능에 미치는 영향",
    "Edge Case & 실패 시나리오",
    "검토한 대안과 선택 이유",
    "리뷰 포인트 (파일/영역별 Risk 🔴🟡🟢)",
)
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

    release_pr = (head, base) == ("develop", "main")
    title_result = (
        validate_release_title(title) if release_pr else validate_work_title(title)
    )
    results = [title_result, validate_branch_flow(head, base)]
    errors: list[str] = []
    sections = extract_sections(_markdown_prose(body))
    for name in REQUIRED_SECTIONS:
        if name not in sections or not sections[name]:
            errors.append(f"PR 필수 섹션이 없습니다: {name}")

    results.append(ValidationResult(tuple(errors)))
    if not release_pr and linked_issue_title is not None and title != linked_issue_title:
        results.append(
            ValidationResult(("PR 제목은 연결 Issue 제목과 같아야 합니다",))
        )
    results.append(
        _validate_closing_references(
            body=body,
            head=head,
            release_pr=release_pr,
            base_repository=base_repository,
        )
    )
    return merge_results(*results)


def _validate_closing_references(
    *,
    body: str,
    head: str,
    release_pr: bool,
    base_repository: str | None,
) -> ValidationResult:
    close_matches = tuple(
        CLOSE_REFERENCE_PATTERN.finditer(_markdown_prose(body))
    )
    errors: list[str] = []
    if release_pr and close_matches:
        errors.append("배포 PR은 Issue를 종료하지 않습니다")
    elif not close_matches and not release_pr:
        errors.append("PR은 Closes #<Issue 번호>를 포함해야 합니다")
    elif len(close_matches) > 1 and not release_pr:
        errors.append("PR은 하나의 Issue만 종료해야 합니다")
    elif not release_pr:
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
