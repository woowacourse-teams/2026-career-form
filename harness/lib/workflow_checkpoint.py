import json
import os
import re
import subprocess
import tempfile
from hashlib import sha256
from collections.abc import Mapping
from dataclasses import dataclass, replace
from pathlib import Path


SCHEMA_VERSION = 2
V1_WORKFLOW_STAGES = ("plan", "implementation", "verification", "draft_pr")
WORKFLOW_STAGES = (
    "plan",
    "implementation",
    "knowledge",
    "verification",
    "draft_pr",
)
LOCAL_GIT_ENVIRONMENT = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_PREFIX",
)


class CheckpointError(ValueError):
    pass


@dataclass(frozen=True)
class StageCheckpoint:
    name: str
    status: str
    started_head: str
    completed_head: str | None = None
    evidence: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class WorkflowCheckpoint:
    schema_version: int
    issue_number: int
    branch: str
    current_stage: str
    stages: tuple[StageCheckpoint, ...]
    knowledge_candidates: tuple[str, ...] = ()
    knowledge_approval_digest: str | None = None


def checkpoint_path(cwd: str | Path) -> Path:
    value = git_value(
        cwd, "rev-parse", "--git-path", "cf-workflow/checkpoint.json"
    )
    path = Path(value)
    return path if path.is_absolute() else Path(cwd).resolve() / path


def initialize_checkpoint(
    cwd: str | Path,
    *,
    issue_number: int,
    branch: str,
    head: str,
) -> WorkflowCheckpoint:
    existing = load_checkpoint(cwd)
    if existing is not None:
        if existing.issue_number != issue_number or existing.branch != branch:
            raise CheckpointError("현재 worktree에 다른 Issue 체크포인트가 있습니다")
        return existing
    _positive_issue_number(issue_number)
    _non_empty(branch, "branch")
    _non_empty(head, "head")
    checkpoint = WorkflowCheckpoint(
        schema_version=SCHEMA_VERSION,
        issue_number=issue_number,
        branch=branch,
        current_stage="plan",
        stages=(StageCheckpoint("plan", "running", head),),
    )
    save_checkpoint(cwd, checkpoint)
    return checkpoint


def begin_stage(
    checkpoint: WorkflowCheckpoint,
    *,
    stage: str,
    head: str,
) -> WorkflowCheckpoint:
    _non_empty(head, "head")
    workflow_stages = _workflow_stages(checkpoint.schema_version)
    if stage not in workflow_stages:
        raise CheckpointError(f"지원하지 않는 단계입니다: {stage}")
    current = stage_checkpoint(checkpoint, checkpoint.current_stage)
    if stage == current.name:
        if current.status != "running":
            raise CheckpointError("완료한 단계는 다시 시작할 수 없습니다")
        return checkpoint
    current_index = workflow_stages.index(current.name)
    if current.status != "completed":
        raise CheckpointError("현재 단계를 완료한 뒤 다음 단계를 시작해야 합니다")
    if current_index + 1 >= len(workflow_stages):
        raise CheckpointError("마지막 단계 이후에는 새 단계를 시작할 수 없습니다")
    if workflow_stages[current_index + 1] != stage:
        raise CheckpointError("단계 순서를 건너뛸 수 없습니다")
    return replace(
        checkpoint,
        current_stage=stage,
        stages=(*checkpoint.stages, StageCheckpoint(stage, "running", head)),
    )


def resume_stage(
    checkpoint: WorkflowCheckpoint,
    *,
    stage: str,
    head: str,
) -> WorkflowCheckpoint:
    _non_empty(head, "head")
    current = stage_checkpoint(checkpoint, checkpoint.current_stage)
    if stage == current.name and current.status == "running":
        return checkpoint
    names = tuple(record.name for record in checkpoint.stages)
    if stage not in names:
        return begin_stage(checkpoint, stage=stage, head=head)
    index = names.index(stage)
    if any(record.status != "completed" for record in checkpoint.stages[:index]):
        raise CheckpointError("이전 단계를 완료한 뒤 재개해야 합니다")
    return replace(
        checkpoint,
        current_stage=stage,
        stages=(
            *checkpoint.stages[:index],
            StageCheckpoint(stage, "running", head),
        ),
    )


def complete_stage(
    checkpoint: WorkflowCheckpoint,
    *,
    stage: str,
    head: str,
    evidence: Mapping[str, str],
) -> WorkflowCheckpoint:
    _non_empty(head, "head")
    current = stage_checkpoint(checkpoint, checkpoint.current_stage)
    if current.name != stage:
        raise CheckpointError("현재 실행 중인 단계만 완료할 수 있습니다")
    if current.status != "running":
        raise CheckpointError("이미 완료한 단계입니다")
    normalized_evidence = _evidence_from(evidence)
    if not normalized_evidence:
        raise CheckpointError("단계 완료에는 완료 근거가 필요합니다")
    _validate_completion_evidence(stage, normalized_evidence, head)
    if stage == "knowledge":
        _validate_knowledge_completion(checkpoint, normalized_evidence)
    completed = replace(
        current,
        status="completed",
        completed_head=head,
        evidence=normalized_evidence,
    )
    return replace(
        checkpoint,
        stages=(*checkpoint.stages[:-1], completed),
    )


def replace_knowledge_candidates(
    checkpoint: WorkflowCheckpoint,
    candidates: tuple[str, ...],
) -> WorkflowCheckpoint:
    if checkpoint.schema_version != SCHEMA_VERSION:
        raise CheckpointError("지식 후보는 schema v2 체크포인트에만 기록할 수 있습니다")
    if _knowledge_is_completed(checkpoint):
        raise CheckpointError("완료한 지식 판정의 후보는 바꿀 수 없습니다")
    normalized = _knowledge_candidates_from(candidates)
    if normalized == checkpoint.knowledge_candidates:
        return checkpoint
    return replace(
        checkpoint,
        knowledge_candidates=normalized,
        knowledge_approval_digest=None,
    )


def knowledge_digest(checkpoint: WorkflowCheckpoint) -> str:
    encoded = json.dumps(
        checkpoint.knowledge_candidates,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return sha256(encoded).hexdigest()


def approve_knowledge(
    checkpoint: WorkflowCheckpoint,
    digest: str,
) -> WorkflowCheckpoint:
    if checkpoint.schema_version != SCHEMA_VERSION:
        raise CheckpointError("지식 승인은 schema v2 체크포인트에만 기록할 수 있습니다")
    if digest != knowledge_digest(checkpoint):
        raise CheckpointError("현재 지식 후보와 승인 digest가 다릅니다")
    return replace(checkpoint, knowledge_approval_digest=digest)


def stage_checkpoint(
    checkpoint: WorkflowCheckpoint, stage: str
) -> StageCheckpoint:
    for record in checkpoint.stages:
        if record.name == stage:
            return record
    raise CheckpointError(f"단계 기록을 찾을 수 없습니다: {stage}")


def load_checkpoint(cwd: str | Path) -> WorkflowCheckpoint | None:
    path = checkpoint_path(cwd)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise CheckpointError(f"체크포인트를 읽을 수 없습니다: {error}") from error
    return checkpoint_from(payload)


def save_checkpoint(
    cwd: str | Path, checkpoint: WorkflowCheckpoint
) -> None:
    payload = checkpoint_payload(checkpoint)
    checkpoint_from(payload)
    path = checkpoint_path(cwd)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=".checkpoint-",
        delete=False,
    ) as temporary:
        json.dump(payload, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = temporary.name
    os.replace(temporary_path, path)


def checkpoint_payload(checkpoint: WorkflowCheckpoint) -> dict[str, object]:
    payload: dict[str, object] = {
        "schema_version": checkpoint.schema_version,
        "issue_number": checkpoint.issue_number,
        "branch": checkpoint.branch,
        "current_stage": checkpoint.current_stage,
        "stages": [
            {
                "name": record.name,
                "status": record.status,
                "started_head": record.started_head,
                "completed_head": record.completed_head,
                "evidence": dict(record.evidence),
            }
            for record in checkpoint.stages
        ],
    }
    if checkpoint.schema_version == SCHEMA_VERSION:
        payload = {
            **payload,
            "knowledge_candidates": list(checkpoint.knowledge_candidates),
            "knowledge_approval_digest": checkpoint.knowledge_approval_digest,
        }
    return payload


def git_value(cwd: str | Path, *arguments: str) -> str:
    completed = _run_git(cwd, *arguments)
    value = completed.stdout.strip()
    if completed.returncode != 0 or not value:
        raise CheckpointError("Git 상태를 확인할 수 없습니다")
    return value


def git_is_clean(cwd: str | Path) -> bool:
    completed = _run_git(cwd, "status", "--porcelain")
    if completed.returncode != 0:
        raise CheckpointError("Git 상태를 확인할 수 없습니다")
    return not completed.stdout.strip()


def checkpoint_from(payload: object) -> WorkflowCheckpoint:
    if not isinstance(payload, Mapping):
        raise CheckpointError("체크포인트는 JSON 객체여야 합니다")
    version = payload.get("schema_version")
    if type(version) is not int or version not in (1, SCHEMA_VERSION):
        raise CheckpointError("지원하지 않는 체크포인트 schema입니다")
    issue_number = payload.get("issue_number")
    _positive_issue_number(issue_number)
    branch = payload.get("branch")
    current_stage = payload.get("current_stage")
    _non_empty(branch, "branch")
    _non_empty(current_stage, "current_stage")
    raw_stages = payload.get("stages")
    if not isinstance(raw_stages, list) or not raw_stages:
        raise CheckpointError("단계 기록은 비어 있지 않은 배열이어야 합니다")
    workflow_stages = _workflow_stages(version)
    stages = tuple(_stage_from(value, workflow_stages) for value in raw_stages)
    names = tuple(record.name for record in stages)
    if names != workflow_stages[: len(names)]:
        raise CheckpointError("단계 기록 순서가 올바르지 않습니다")
    if current_stage != stages[-1].name:
        raise CheckpointError("현재 단계가 마지막 단계 기록과 다릅니다")
    if any(record.status != "completed" for record in stages[:-1]):
        raise CheckpointError("이전 단계가 완료되지 않았습니다")
    candidates = _knowledge_candidates_from(payload.get("knowledge_candidates", ()))
    approval = payload.get("knowledge_approval_digest")
    if approval is not None and not _valid_digest(approval):
        raise CheckpointError("knowledge_approval_digest가 유효하지 않습니다")
    checkpoint = WorkflowCheckpoint(
        schema_version=version,
        issue_number=issue_number,
        branch=branch,
        current_stage=current_stage,
        stages=stages,
        knowledge_candidates=candidates,
        knowledge_approval_digest=approval,
    )
    if version == 1:
        return _upgrade_v1(checkpoint)
    if _knowledge_is_completed(checkpoint):
        _validate_knowledge_completion(
            checkpoint,
            stage_checkpoint(checkpoint, "knowledge").evidence,
        )
    return checkpoint


def _stage_from(
    value: object,
    workflow_stages: tuple[str, ...],
) -> StageCheckpoint:
    if not isinstance(value, Mapping):
        raise CheckpointError("단계 기록은 JSON 객체여야 합니다")
    name = value.get("name")
    status = value.get("status")
    started_head = value.get("started_head")
    completed_head = value.get("completed_head")
    _non_empty(name, "stage.name")
    _non_empty(started_head, "stage.started_head")
    if name not in workflow_stages:
        raise CheckpointError(f"지원하지 않는 단계입니다: {name}")
    if status not in ("running", "completed"):
        raise CheckpointError("단계 상태는 running 또는 completed여야 합니다")
    if completed_head is not None and not isinstance(completed_head, str):
        raise CheckpointError("stage.completed_head는 문자열이어야 합니다")
    if status == "completed" and not completed_head:
        raise CheckpointError("완료 단계에는 완료 HEAD가 필요합니다")
    if status == "running" and completed_head is not None:
        raise CheckpointError("실행 중인 단계에는 완료 HEAD를 기록할 수 없습니다")
    evidence = value.get("evidence", {})
    if not isinstance(evidence, Mapping):
        raise CheckpointError("stage.evidence는 JSON 객체여야 합니다")
    normalized_evidence = _evidence_from(evidence)
    if status == "completed" and not normalized_evidence:
        raise CheckpointError("완료 단계에는 완료 근거가 필요합니다")
    if status == "completed":
        _validate_completion_evidence(name, normalized_evidence, completed_head)
    return StageCheckpoint(
        name=name,
        status=status,
        started_head=started_head,
        completed_head=completed_head,
        evidence=normalized_evidence,
    )


def _evidence_from(value: Mapping[object, object]) -> tuple[tuple[str, str], ...]:
    if any(not isinstance(key, str) or not isinstance(item, str) for key, item in value.items()):
        raise CheckpointError("완료 근거의 이름과 값은 문자열이어야 합니다")
    if any(not key or not item for key, item in value.items()):
        raise CheckpointError("완료 근거의 이름과 값은 비어 있을 수 없습니다")
    return tuple(sorted(value.items()))


def _validate_completion_evidence(
    stage: str,
    evidence: tuple[tuple[str, str], ...],
    completed_head: str,
) -> None:
    values = dict(evidence)
    if stage == "plan" and "plan_path" not in values:
        raise CheckpointError("plan 완료 근거에는 plan_path가 필요합니다")
    if stage == "implementation" and values.get("commit") != completed_head:
        raise CheckpointError("implementation commit은 완료 HEAD와 같아야 합니다")
    if stage == "verification" and (
        "command" not in values or values.get("result") != "passed"
    ):
        raise CheckpointError(
            "verification 완료 근거에는 command와 result=passed가 필요합니다"
        )
    if stage == "knowledge":
        outcome = values.get("outcome")
        if outcome not in ("Recorded", "No reusable knowledge"):
            raise CheckpointError("knowledge 완료 근거에는 유효한 outcome이 필요합니다")
        if not _valid_digest(values.get("approval_digest")):
            raise CheckpointError("knowledge 완료 근거에는 승인 digest가 필요합니다")
        if outcome == "Recorded" and "manifest" not in values:
            raise CheckpointError("Recorded 완료 근거에는 manifest가 필요합니다")
    if stage == "draft_pr" and not _valid_pull_request_evidence(values):
        raise CheckpointError("Draft PR 완료 근거에는 유효한 번호와 URL이 필요합니다")


def _valid_pull_request_evidence(values: Mapping[str, str]) -> bool:
    number = values.get("pr_number", "")
    url = values.get("pr_url", "")
    if not number.isdigit() or int(number) < 1:
        return False
    return (
        re.fullmatch(
            rf"https://github\.com/[^/]+/[^/]+/pull/{re.escape(number)}",
            url,
        )
        is not None
    )


def _positive_issue_number(value: object) -> None:
    if type(value) is not int or value < 1:
        raise CheckpointError("Issue 번호는 양의 정수여야 합니다")


def _workflow_stages(version: int) -> tuple[str, ...]:
    if version == 1:
        return V1_WORKFLOW_STAGES
    if version == SCHEMA_VERSION:
        return WORKFLOW_STAGES
    raise CheckpointError("지원하지 않는 체크포인트 schema입니다")


def _upgrade_v1(checkpoint: WorkflowCheckpoint) -> WorkflowCheckpoint:
    if checkpoint.current_stage == "draft_pr":
        return checkpoint
    records = tuple(
        record
        for record in checkpoint.stages
        if record.name in ("plan", "implementation")
    )
    if checkpoint.current_stage in ("verification",):
        implementation = stage_checkpoint(checkpoint, "implementation")
        head = implementation.completed_head or implementation.started_head
        return replace(
            checkpoint,
            schema_version=SCHEMA_VERSION,
            current_stage="knowledge",
            stages=(*records, StageCheckpoint("knowledge", "running", head)),
        )
    return replace(checkpoint, schema_version=SCHEMA_VERSION, stages=records)


def _knowledge_candidates_from(value: object) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)):
        raise CheckpointError("knowledge_candidates는 배열이어야 합니다")
    normalized: list[str] = []
    for candidate in value:
        if not isinstance(candidate, str) or not candidate.strip():
            raise CheckpointError("지식 후보는 비어 있지 않은 문자열이어야 합니다")
        item = candidate.strip()
        if item not in normalized:
            normalized.append(item)
    return tuple(normalized)


def _knowledge_is_completed(checkpoint: WorkflowCheckpoint) -> bool:
    try:
        return stage_checkpoint(checkpoint, "knowledge").status == "completed"
    except CheckpointError:
        return False


def _validate_knowledge_completion(
    checkpoint: WorkflowCheckpoint,
    evidence: tuple[tuple[str, str], ...],
) -> None:
    values = dict(evidence)
    digest = values.get("approval_digest")
    if checkpoint.knowledge_approval_digest != digest:
        raise CheckpointError("현재 지식 후보에 대한 사람 승인이 필요합니다")
    if digest != knowledge_digest(checkpoint):
        raise CheckpointError("승인 뒤 지식 후보가 변경됐습니다")
    outcome = values.get("outcome")
    if outcome == "Recorded" and not checkpoint.knowledge_candidates:
        raise CheckpointError("Recorded 판정에는 지식 후보가 필요합니다")
    if outcome == "No reusable knowledge" and checkpoint.knowledge_candidates:
        raise CheckpointError("지식 후보가 있으면 No reusable knowledge로 완료할 수 없습니다")


def _valid_digest(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _non_empty(value: object, name: str) -> None:
    if not isinstance(value, str) or not value:
        raise CheckpointError(f"{name}은 비어 있지 않은 문자열이어야 합니다")


def _run_git(cwd: str | Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    for name in LOCAL_GIT_ENVIRONMENT:
        environment.pop(name, None)
    try:
        return subprocess.run(
            ("git", *arguments),
            cwd=cwd,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as error:
        raise CheckpointError("Git 상태를 확인할 수 없습니다") from error
