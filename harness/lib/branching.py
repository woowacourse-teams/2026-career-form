import re

from harness.lib.result import ValidationResult


WORK_BRANCH_PATTERN = re.compile(r"^CF-(?P<issue>[1-9][0-9]*)$")
VERSION_PART = r"(?:0|[1-9][0-9]*)"
RELEASE_BRANCH_PATTERN = re.compile(
    rf"^release/(?P<version>{VERSION_PART}\.{VERSION_PART}\.{VERSION_PART})$"
)
REVERT_BRANCH_PATTERN = re.compile(r"^revert/(?P<sha>[0-9a-f]{7,40})$")


def validate_branch_flow(head: str, base: str) -> ValidationResult:
    if (head, base) == ("develop", "main"):
        return ValidationResult(("릴리스 브랜치를 통해 main으로 병합해야 합니다",))

    if head.startswith("release/"):
        if not is_release_branch(head):
            return ValidationResult(
                ("release 브랜치는 release/<MAJOR.MINOR.PATCH> 형식이어야 합니다",)
            )
        if base in ("main", "develop"):
            return ValidationResult()
        return ValidationResult(("release 브랜치는 main 또는 develop으로만 병합합니다",))

    if base.startswith("release/") and not is_release_branch(base):
        return ValidationResult(
            ("release 브랜치는 release/<MAJOR.MINOR.PATCH> 형식이어야 합니다",)
        )

    if head.startswith("revert/"):
        if not is_revert_branch(head):
            return ValidationResult(
                ("되돌림 브랜치는 revert/<commit-sha> 형식이어야 합니다",)
            )
        if base == "main":
            return ValidationResult()
        return ValidationResult(("되돌림 브랜치는 main으로만 병합합니다",))

    if head == "main":
        if base == "develop" or is_release_branch(base):
            return ValidationResult()
        return ValidationResult(
            ("main 브랜치는 develop 또는 활성 release 브랜치로만 동기화합니다",)
        )

    match = WORK_BRANCH_PATTERN.match(head)
    if match is None:
        return ValidationResult(("작업 브랜치는 CF-<Issue 번호> 형식이어야 합니다",))

    if base not in ("develop", "main") and not is_release_branch(base):
        return ValidationResult(
            ("작업 브랜치는 develop, release 또는 hotfix의 main으로만 병합합니다",)
        )

    return ValidationResult()


def issue_number_from_branch(branch: str) -> str | None:
    match = WORK_BRANCH_PATTERN.match(branch)
    return match.group("issue") if match is not None else None


def is_release_branch(branch: str) -> bool:
    return RELEASE_BRANCH_PATTERN.fullmatch(branch) is not None


def is_revert_branch(branch: str) -> bool:
    return REVERT_BRANCH_PATTERN.fullmatch(branch) is not None


def is_system_pr(head: str, base: str) -> bool:
    return (
        (is_release_branch(head) and base in ("main", "develop"))
        or (head == "main" and (base == "develop" or is_release_branch(base)))
        or (is_revert_branch(head) and base == "main")
    )
