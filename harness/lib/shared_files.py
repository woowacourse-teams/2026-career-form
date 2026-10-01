import re
from collections.abc import Sequence

from harness.lib.result import ValidationResult


PROTECTED_FILES = ("AGENTS.md",)
PROTECTED_PREFIXES = (
    ".agents/skills/",
    ".codex/",
    ".github/ISSUE_TEMPLATE/",
    ".github/workflows/",
    ".githooks/",
    "harness/",
)
CLOSING_ISSUE_PATTERN = re.compile(
    r"(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)"
)


def validate_shared_file_change(
    paths: Sequence[str],
    labels: Sequence[str],
    linked_issue_labels: Sequence[str] = (),
) -> ValidationResult:
    shared_changed = any(_is_protected(path) for path in paths)
    errors: list[str] = []
    if shared_changed and "harness-change" not in labels:
        errors.append("공유 하네스 파일 변경에는 harness-change 라벨이 필요합니다")
    if shared_changed and "harness-change" not in linked_issue_labels:
        errors.append("공유 하네스 변경은 harness-change Issue에 연결해야 합니다")
    return ValidationResult(tuple(errors))


def closing_issue_numbers(body: str) -> tuple[int, ...]:
    return tuple(dict.fromkeys(int(value) for value in CLOSING_ISSUE_PATTERN.findall(body)))


def _is_protected(path: str) -> bool:
    return path in PROTECTED_FILES or path.startswith(PROTECTED_PREFIXES)
