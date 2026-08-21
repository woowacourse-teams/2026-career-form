from dataclasses import dataclass

from harness.lib.workflow_checkpoint import (
    CheckpointError,
    WorkflowCheckpoint,
    stage_checkpoint,
)


class DeliveryError(ValueError):
    pass


@dataclass(frozen=True)
class DeliveryObservation:
    issue_number: int
    branch: str
    head: str
    plan_exists: bool
    worktree_clean: bool = True
    pull_request_number: int | None = None
    pull_request_head: str | None = None


@dataclass(frozen=True)
class DeliveryAction:
    code: str
    reason: str


def next_delivery_action(
    checkpoint: WorkflowCheckpoint,
    observation: DeliveryObservation,
) -> DeliveryAction:
    _validate_identity(checkpoint, observation)
    records = {record.name: record for record in checkpoint.stages}
    plan = records.get("plan")
    if plan is None or plan.status != "completed" or not observation.plan_exists:
        return DeliveryAction(
            "resume_plan",
            "계획 완료 근거를 다시 확인해야 합니다.",
        )
    implementation = records.get("implementation")
    if implementation is None or implementation.status != "completed":
        return DeliveryAction(
            "resume_implementation",
            "구현 단계부터 이어서 작업해야 합니다.",
        )
    knowledge = records.get("knowledge")
    if checkpoint.schema_version >= 2 and (
        knowledge is None or knowledge.status != "completed"
    ):
        return DeliveryAction(
            "resume_knowledge",
            "지식 후보를 한 번에 확인하고 확정해야 합니다.",
        )
    verification = records.get("verification")
    if verification is None or verification.status != "completed":
        return DeliveryAction(
            "resume_verification",
            "현재 구현 결과를 검증해야 합니다.",
        )
    if (
        verification.completed_head != observation.head
        or not observation.worktree_clean
    ):
        return DeliveryAction(
            "resume_verification",
            "현재 Git 상태가 완료된 검증 근거와 다릅니다.",
        )
    draft_pr = records.get("draft_pr")
    if observation.pull_request_number is not None:
        if observation.pull_request_head != observation.head:
            raise DeliveryError("Draft PR HEAD가 현재 HEAD와 다릅니다")
        if draft_pr is None or draft_pr.status == "running":
            return DeliveryAction(
                "record_draft_pr",
                "기존 Draft PR을 완료 근거로 기록해야 합니다.",
            )
        return DeliveryAction("complete", "Draft PR 생성 단계까지 완료됐습니다.")
    if draft_pr is None:
        return DeliveryAction(
            "create_draft_pr",
            "현재 HEAD 검증이 끝나 Draft PR을 만들 수 있습니다.",
        )
    if draft_pr.status == "running":
        return DeliveryAction(
            "create_draft_pr",
            "Draft PR 생성 단계가 완료되지 않았습니다.",
        )
    raise DeliveryError("완료된 Draft PR의 원격 상태를 확인할 수 없습니다")


def _validate_identity(
    checkpoint: WorkflowCheckpoint,
    observation: DeliveryObservation,
) -> None:
    if checkpoint.issue_number != observation.issue_number:
        raise DeliveryError("체크포인트 Issue 번호가 현재 Issue와 다릅니다")
    if checkpoint.branch != observation.branch:
        raise DeliveryError("체크포인트 브랜치가 현재 브랜치와 다릅니다")
    if not observation.head:
        raise DeliveryError("현재 HEAD를 확인할 수 없습니다")
    try:
        stage_checkpoint(checkpoint, checkpoint.current_stage)
    except CheckpointError as error:
        raise DeliveryError(str(error)) from error
