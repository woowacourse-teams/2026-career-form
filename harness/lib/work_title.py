import re

from harness.lib.result import ValidationResult


TITLE_PATTERN = re.compile(
    r"^\[(?P<area>[A-Za-z][A-Za-z0-9-]*)\] (?P<description>.+)$"
)
KOREAN_PATTERN = re.compile(r"[가-힣]")
CONVENTIONAL_PREFIX_PATTERN = re.compile(
    r"^(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)"
    r"(?:\([^()\r\n]+\))?!?:\s*"
)
FORMAL_DECLARATIVE_ENDING_PATTERN = re.compile(
    r"(?:합니다|했습니다|됩니다)$"
)
ALLOWED_AREAS = frozenset(("FE", "BE", "AI", "Infra", "Harness", "Plan"))
RELEASE_TITLE_PATTERN = re.compile(r"^\[Release\] (?P<description>.+)$")


def validate_work_title(title: str) -> ValidationResult:
    match = TITLE_PATTERN.match(title)
    if match is None:
        return ValidationResult(("제목은 [영역] 작업명 형식이어야 합니다",))

    area = match.group("area")
    description = match.group("description")
    errors: tuple[str, ...] = ()
    if area not in ALLOWED_AREAS:
        errors += ("영역은 FE, BE, AI, Infra, Harness, Plan 중 하나여야 합니다",)
    if CONVENTIONAL_PREFIX_PATTERN.match(description) is not None:
        errors += (
            "Issue와 PR 제목에 Conventional Commit type을 사용할 수 없습니다",
        )
    errors += _validate_description(description)
    return ValidationResult(errors)


def validate_release_title(title: str) -> ValidationResult:
    match = RELEASE_TITLE_PATTERN.match(title)
    if match is None:
        return ValidationResult(("배포 PR 제목은 [Release] 작업명 형식이어야 합니다",))

    description = match.group("description")
    return ValidationResult(_validate_description(description))


def _validate_description(description: str) -> tuple[str, ...]:
    errors: tuple[str, ...] = ()
    if KOREAN_PATTERN.search(description) is None:
        errors += ("작업명에는 한글이 포함되어야 합니다",)
    if description.endswith("한다"):
        errors += ("작업명은 한다로 끝낼 수 없습니다",)
    elif FORMAL_DECLARATIVE_ENDING_PATTERN.search(description) is not None:
        errors += ("작업명은 명사형이어야 합니다",)
    if description.endswith("."):
        errors += ("작업명 끝에 마침표를 사용할 수 없습니다",)
    return errors
