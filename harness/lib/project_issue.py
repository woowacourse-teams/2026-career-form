from dataclasses import dataclass


PLANNING_ACTIONS = (
    "select_draft",
    "promote_draft",
    "set_in_progress",
    "draft_contract",
    "write_plan",
    "await_approval",
    "publish_contract",
    "complete",
)


@dataclass(frozen=True)
class ProjectIssueSnapshot:
    draft_matches: int
    issue_number: int | None = None
    project_status: str | None = None
    contract_drafted: bool = False
    plan_exists: bool = False
    approved: bool = False
    contract_published: bool = False


@dataclass(frozen=True)
class PlanningAction:
    code: str
    reason: str


def next_planning_action(snapshot: ProjectIssueSnapshot) -> PlanningAction:
    if snapshot.issue_number is None:
        if snapshot.draft_matches != 1:
            return PlanningAction(
                code="select_draft",
                reason="제목이 일치하는 draft를 하나로 확정해야 합니다.",
            )
        return PlanningAction(
            code="promote_draft",
            reason="확정한 draft를 repository Issue로 승격해야 합니다.",
        )
    if snapshot.project_status != "In Progress":
        return PlanningAction(
            code="set_in_progress",
            reason="승격된 Issue의 Project 상태를 In Progress로 맞춰야 합니다.",
        )
    if not snapshot.contract_drafted:
        return PlanningAction(
            code="draft_contract",
            reason="Issue 본문에 작업 계약을 작성해야 합니다.",
        )
    if not snapshot.plan_exists:
        return PlanningAction(
            code="write_plan",
            reason="하나의 PR 안에서 수행할 논리적 커밋 계획이 필요합니다.",
        )
    if not snapshot.approved:
        return PlanningAction(
            code="await_approval",
            reason="Issue 계약과 구현 계획에 사람 승인이 필요합니다.",
        )
    if not snapshot.contract_published:
        return PlanningAction(
            code="publish_contract",
            reason="승인된 Issue 계약을 원격 Issue 본문에 게시해야 합니다.",
        )
    return PlanningAction(
        code="complete",
        reason="Issue 기반 개발을 시작할 준비가 끝났습니다.",
    )
