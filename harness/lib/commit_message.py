import re

from harness.lib.result import ValidationResult


ALLOWED_TYPES = (
    "feat",
    "fix",
    "refactor",
    "test",
    "perf",
    "docs",
    "chore",
    "ci",
    "build",
    "revert",
)
TITLE_PATTERN = re.compile(
    r"^(?P<type>[a-z]+)(?P<breaking>!)?: (?P<description>.+)$"
)
SCOPE_PATTERN = re.compile(r"^[a-z]+\([^)]+\)!?:")
KOREAN_PATTERN = re.compile(r"[가-힣]")


def validate_commit_message(message: str) -> ValidationResult:
    title, _, remainder = message.strip().partition("\n")
    errors: list[str] = []

    if SCOPE_PATTERN.match(title):
        errors.append("scope는 사용할 수 없습니다")
        return ValidationResult(tuple(errors))

    match = TITLE_PATTERN.match(title)
    if match is None:
        return ValidationResult(
            ("커밋 제목은 <type>: <한글 설명> 형식이어야 합니다",)
        )

    commit_type = match.group("type")
    description = match.group("description")
    breaking = match.group("breaking") is not None
    has_breaking_footer = any(
        line.startswith("BREAKING CHANGE:") for line in remainder.splitlines()
    )

    if commit_type not in ALLOWED_TYPES:
        errors.append(f"허용되지 않은 type입니다: {commit_type}")
    if KOREAN_PATTERN.search(description) is None:
        errors.append("설명에는 한글이 포함되어야 합니다")
    if description.endswith("."):
        errors.append("제목 끝에 마침표를 사용할 수 없습니다")
    if description.endswith("한다"):
        errors.append("커밋 설명은 한다로 끝낼 수 없습니다")
    if breaking and not has_breaking_footer:
        errors.append("Breaking Change에는 BREAKING CHANGE Footer가 필요합니다")
    if has_breaking_footer and not breaking:
        errors.append("BREAKING CHANGE Footer를 사용하면 제목에 !가 필요합니다")

    return ValidationResult(tuple(errors))
