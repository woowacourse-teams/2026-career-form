import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from harness.lib.workflow_checkpoint import (
    CheckpointError,
    WorkflowCheckpoint,
    stage_checkpoint,
)


LONG_LIVED_BRANCHES = ("master", "main", "develop")
WRITE_TOOLS = ("apply_patch", "Edit", "Write")
SHELL_TOOLS = (
    "Bash",
    "Shell",
    "shell",
    "exec_command",
    "functions.exec_command",
)
DANGEROUS_TOOL_NAME_PATTERN = re.compile(
    r"(?:^|__|_)(?:delete|destroy|drop|deploy|migrate|merge_pull_request|"
    r"approve_pull_request|secret|credential|token)(?:$|__|_)|"
    r"(?:^|__|_)(?:remove|unlink)_(?:file|directory|path)(?:$|__|_)",
    re.IGNORECASE,
)
RULES = (
    (
        "GitHub Issue와 PR 본문은 템플릿 파일과 --body-file을 사용해야 합니다",
        re.compile(
            r"gh\s+(?:issue|pr)\s+(?:create|edit)(?:\s|$)[^\n]*"
            r"--body(?:=|\s)"
        ),
    ),
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
ISSUE_BRANCH_PATTERN = re.compile(r"^(?:CF-\d+|hotfix/CF-\d+)$")
DRAFT_PR_CREATE_PATTERN = re.compile(r"(?:^|[;&|]\s*)gh\s+pr\s+create(?:\s|$)")


@dataclass(frozen=True)
class HookDecision:
    blocked: bool
    reason: str = ""


def evaluate_tool_use(
    payload: Mapping[str, object],
    branch: str | None,
    *,
    checkpoint: WorkflowCheckpoint | None = None,
    current_head: str | None = None,
    worktree_clean: bool | None = None,
) -> HookDecision:
    tool_name = payload.get("tool_name")
    tool_input = payload.get("tool_input")
    command = _command(tool_input)

    if isinstance(tool_name, str) and DANGEROUS_TOOL_NAME_PATTERN.search(tool_name):
        return HookDecision(True, "위험 도구는 AI가 실행할 수 없습니다")

    if tool_name in (*WRITE_TOOLS, *SHELL_TOOLS) and command is None:
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

    if tool_name not in SHELL_TOOLS:
        return HookDecision(False)

    if SECRET_FILE_PATTERN.search(command):
        return HookDecision(True, "시크릿 접근은 AI가 실행할 수 없습니다")

    if branch in LONG_LIVED_BRANCHES and _mutates_repository(command):
        return HookDecision(True, "장기 브랜치에서는 저장소를 변경할 수 없습니다")

    for reason, pattern in RULES:
        if pattern.search(command):
            return HookDecision(True, reason)

    if DRAFT_PR_CREATE_PATTERN.search(command) and (
        branch is not None and ISSUE_BRANCH_PATTERN.fullmatch(branch)
    ):
        return _draft_pr_decision(
            checkpoint,
            branch=branch,
            current_head=current_head,
            worktree_clean=worktree_clean,
        )

    return HookDecision(False)


def needs_workflow_checkpoint(
    payload: Mapping[str, object], branch: str | None
) -> bool:
    command = _command(payload.get("tool_input"))
    return (
        payload.get("tool_name") in SHELL_TOOLS
        and command is not None
        and DRAFT_PR_CREATE_PATTERN.search(command) is not None
        and branch is not None
        and ISSUE_BRANCH_PATTERN.fullmatch(branch) is not None
    )


def _draft_pr_decision(
    checkpoint: WorkflowCheckpoint | None,
    *,
    branch: str,
    current_head: str | None,
    worktree_clean: bool | None,
) -> HookDecision:
    if checkpoint is None:
        return HookDecision(True, "현재 HEAD의 검증 체크포인트가 없습니다")
    if checkpoint.branch != branch:
        return HookDecision(True, "체크포인트 브랜치가 현재 브랜치와 다릅니다")
    if not current_head:
        return HookDecision(True, "현재 HEAD를 확인할 수 없습니다")
    if worktree_clean is not True:
        return HookDecision(True, "커밋되지 않은 변경이 있어 Draft PR을 만들 수 없습니다")
    try:
        verification = stage_checkpoint(checkpoint, "verification")
    except CheckpointError:
        return HookDecision(True, "현재 HEAD의 검증 체크포인트가 없습니다")
    if (
        verification.status != "completed"
        or verification.completed_head != current_head
    ):
        return HookDecision(True, "현재 HEAD와 일치하는 검증 완료 근거가 없습니다")
    return HookDecision(False)


def _command(tool_input: object) -> str | None:
    if not isinstance(tool_input, Mapping):
        return None
    for name in ("command", "cmd"):
        command = tool_input.get(name)
        if isinstance(command, str):
            return command
    return None


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
