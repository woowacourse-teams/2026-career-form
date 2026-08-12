import re

from harness.lib.result import ValidationResult


WORK_BRANCH_PATTERN = re.compile(
    r"^(?P<kind>feature|hotfix)/(?P<issue>[1-9][0-9]*)-(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*)$"
)


def validate_branch_flow(head: str, base: str) -> ValidationResult:
    if head.startswith("release/") or base.startswith("release/"):
        return ValidationResult(("release 브랜치는 사용하지 않습니다",))

    if (head, base) in (("develop", "main"), ("main", "develop")):
        return ValidationResult()

    match = WORK_BRANCH_PATTERN.match(head)
    if match is None:
        return ValidationResult(
            ("작업 브랜치는 <종류>/<Issue 번호>-<slug> 형식이어야 합니다",)
        )

    kind = match.group("kind")
    if kind == "feature" and base != "develop":
        return ValidationResult(("feature 브랜치는 develop으로만 병합합니다",))
    if kind == "hotfix" and base != "main":
        return ValidationResult(("hotfix 브랜치는 main으로만 병합합니다",))

    return ValidationResult()


def issue_number_from_branch(branch: str) -> str | None:
    match = WORK_BRANCH_PATTERN.match(branch)
    return match.group("issue") if match is not None else None
