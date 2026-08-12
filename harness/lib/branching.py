import re

from harness.lib.result import ValidationResult


WORK_BRANCH_PATTERN = re.compile(r"^CF-(?P<issue>[1-9][0-9]*)$")


def validate_branch_flow(head: str, base: str) -> ValidationResult:
    if head.startswith("release/") or base.startswith("release/"):
        return ValidationResult(("release 브랜치는 사용하지 않습니다",))

    if (head, base) == ("develop", "main"):
        return ValidationResult()

    if (head, base) == ("main", "develop"):
        return ValidationResult(
            ("프로덕션 승격은 develop에서 main 방향만 허용합니다",)
        )

    match = WORK_BRANCH_PATTERN.match(head)
    if match is None:
        return ValidationResult(("작업 브랜치는 CF-<Issue 번호> 형식이어야 합니다",))

    if base != "develop":
        return ValidationResult(
            ("일반 작업 브랜치는 develop으로만 병합합니다",)
        )

    return ValidationResult()


def issue_number_from_branch(branch: str) -> str | None:
    match = WORK_BRANCH_PATTERN.match(branch)
    return match.group("issue") if match is not None else None
