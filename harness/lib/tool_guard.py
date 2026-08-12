import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass


LONG_LIVED_BRANCHES = ("master", "main", "develop")
WRITE_TOOLS = ("apply_patch", "Edit", "Write")
DANGEROUS_TOOL_NAME_PATTERN = re.compile(
    r"(?:^|__|_)(?:delete|destroy|drop|deploy|migrate|merge_pull_request|"
    r"approve_pull_request|secret|credential|token)(?:$|__|_)|"
    r"(?:^|__|_)(?:remove|unlink)_(?:file|directory|path)(?:$|__|_)",
    re.IGNORECASE,
)
RULES = (
    (
        "삭제 명령은 AI가 실행할 수 없습니다",
        re.compile(
            r"(^|[;&|]\s*|\s)(?:rm|unlink|shred|rmdir)\s|"
            r"find\s+[^\n]*\s-delete(?:\s|$)|"
            r"(?:os\.remove|os\.unlink|shutil\.rmtree|Path\([^\n]*\)\.unlink)\s*\("
        ),
    ),
    (
        "파괴적 Git 명령은 AI가 실행할 수 없습니다",
        re.compile(
            r"git\s+(?:reset\s+--hard|clean(?:\s|$)|"
            r"push[^\n]*(?:--force|-f(?:\s|$))|branch\s+-D(?:\s|$)|"
            r"stash\s+(?:drop|clear)|worktree\s+remove[^\n]*--force)"
        ),
    ),
    (
        "장기 브랜치 직접 push는 AI가 실행할 수 없습니다",
        re.compile(
            r"git\s+push(?:\s+\S+)?\s+(?:refs/heads/)?(?:master|main|develop)(?:\s|$)|"
            r"git\s+push[^\n]*:(?:refs/heads/)?(?:master|main|develop)(?:\s|$)"
        ),
    ),
    (
        "PR 최종 승인과 머지는 사람만 수행할 수 있습니다",
        re.compile(r"gh\s+pr\s+(?:merge|review)(?:\s|$)"),
    ),
    (
        "시크릿 접근은 AI가 실행할 수 없습니다",
        re.compile(r"gh\s+auth\s+token|gh\s+secret(?:\s|$)|(?:cat|less|head|tail)\s+[^\n]*\.env(?:\s|$)"),
    ),
    (
        "마이그레이션은 AI가 실행할 수 없습니다",
        re.compile(
            r"manage\.py\s+migrate|alembic\s+upgrade|prisma\s+migrate|"
            r"rails\s+db:migrate|flyway|liquibase"
        ),
    ),
    (
        "배포는 AI가 실행할 수 없습니다",
        re.compile(
            r"kubectl\s+apply|helm\s+(?:install|upgrade)|terraform\s+apply|"
            r"vercel\s+deploy|fly\s+deploy|gh\s+(?:workflow\s+run|release\s+create)"
        ),
    ),
)
SECRET_FILE_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_])(?:\.env(?:\.[A-Za-z0-9_-]+)?|id_rsa|"
    r"[A-Za-z0-9_.-]+\.(?:pem|key))(?![A-Za-z0-9_.-])"
)


@dataclass(frozen=True)
class HookDecision:
    blocked: bool
    reason: str = ""


def evaluate_tool_use(
    payload: Mapping[str, object], branch: str | None
) -> HookDecision:
    tool_name = payload.get("tool_name")
    tool_input = payload.get("tool_input")
    command = _command(tool_input)

    if isinstance(tool_name, str) and DANGEROUS_TOOL_NAME_PATTERN.search(tool_name):
        return HookDecision(True, "위험 도구는 AI가 실행할 수 없습니다")

    if tool_name in (*WRITE_TOOLS, "Bash") and command is None:
        return HookDecision(True, "도구 입력을 확인할 수 없습니다")
    if command is None:
        if _contains_secret(tool_input):
            return HookDecision(True, "시크릿 접근은 AI가 실행할 수 없습니다")
        return HookDecision(False)

    if tool_name in WRITE_TOOLS:
        if branch in LONG_LIVED_BRANCHES:
            return HookDecision(True, "장기 브랜치에서는 파일을 수정할 수 없습니다")
        if "*** Delete File:" in command:
            return HookDecision(True, "파일 삭제는 AI가 실행할 수 없습니다")
        if SECRET_FILE_PATTERN.search(command):
            return HookDecision(True, "시크릿 파일은 AI가 수정할 수 없습니다")

    if tool_name != "Bash":
        return HookDecision(False)

    if SECRET_FILE_PATTERN.search(command):
        return HookDecision(True, "시크릿 접근은 AI가 실행할 수 없습니다")

    if branch in LONG_LIVED_BRANCHES and _mutates_repository(command):
        return HookDecision(True, "장기 브랜치에서는 저장소를 변경할 수 없습니다")

    for reason, pattern in RULES:
        if pattern.search(command):
            return HookDecision(True, reason)

    return HookDecision(False)


def _command(tool_input: object) -> str | None:
    if not isinstance(tool_input, Mapping):
        return None
    command = tool_input.get("command")
    return command if isinstance(command, str) else None


def _contains_secret(value: object) -> bool:
    if isinstance(value, str):
        return SECRET_FILE_PATTERN.search(value) is not None
    if isinstance(value, Mapping):
        return any(_contains_secret(item) for item in value.values())
    if isinstance(value, Sequence):
        return any(_contains_secret(item) for item in value)
    return False


def _mutates_repository(command: str) -> bool:
    return re.search(
        r"git\s+(?:add|commit|merge|rebase|cherry-pick)|"
        r"(?:^|[;&|]\s*)(?:touch|mkdir|mv|cp)\s|sed\s+-i",
        command,
    ) is not None
