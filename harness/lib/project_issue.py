from dataclasses import dataclass


PLANNING_ACTIONS = (
    "await_draft",
    "select_draft",
    "fix_title",
    "promote_draft",
    "set_planning",
    "set_in_progress",
    "draft_contract",
    "write_plan",
    "await_unblock",
    "publish_planning_contract",
    "await_approval",
    "validate_latest_contract",
    "set_ready",
    "complete",
)


@dataclass(frozen=True)
class ProjectIssueSnapshot:
    draft_matches: int
    issue_number: int | None = None
    title_valid: bool = True
    issue_status_label: str | None = None
    project_status: str | None = None
    contract_drafted: bool = False
    plan_exists: bool = False
    approved: bool = False
    contract_published: bool = False
    contract_valid: bool = False
    approved_contract_digest: str | None = None
    latest_contract_digest: str | None = None


@dataclass(frozen=True)
class PlanningAction:
    code: str
    reason: str


def next_planning_action(snapshot: ProjectIssueSnapshot) -> PlanningAction:
    if snapshot.issue_number is None:
        return _next_draft_action(snapshot)
    if snapshot.issue_status_label == "status:blocked":
        return PlanningAction(
            code="await_unblock",
            reason="사람이 Issue 차단을 해제할 때까지 상태를 유지해야 합니다.",
        )
    return _next_issue_action(snapshot)


def _next_draft_action(snapshot: ProjectIssueSnapshot) -> PlanningAction:
    if snapshot.draft_matches == 0:
        return PlanningAction(
            code="await_draft",
            reason="사람이 작업할 Project draft를 만들어야 합니다.",
        )
    if snapshot.draft_matches > 1:
        return PlanningAction(
            code="select_draft",
            reason="제목이 일치하는 draft를 하나로 확정해야 합니다.",
        )
    if not snapshot.title_valid:
        return PlanningAction(
            code="fix_title",
            reason="draft 제목을 [영역] 작업명 형식으로 보정해야 합니다.",
        )
    return PlanningAction(
        code="promote_draft",
        reason="확정한 draft를 repository Issue로 승격해야 합니다.",
    )


def _next_issue_action(snapshot: ProjectIssueSnapshot) -> PlanningAction:
    if not snapshot.title_valid:
        return PlanningAction(
            code="fix_title",
            reason="Issue 제목을 [영역] 작업명 형식으로 보정해야 합니다.",
        )
    contract_complete = (
        snapshot.contract_drafted
        and snapshot.plan_exists
        and snapshot.approved
        and snapshot.contract_published
        and snapshot.contract_valid
    )
    ready_contract_observed = (
        contract_complete
        and snapshot.issue_status_label == "status:ready"
    )
    if (
        snapshot.issue_status_label != "status:planning"
        and not ready_contract_observed
    ):
        return PlanningAction(
            code="set_planning",
            reason="승격된 Issue에 status:planning 라벨을 적용해야 합니다.",
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
    if not snapshot.contract_published:
        return PlanningAction(
            code="publish_planning_contract",
            reason="Issue 계약 초안을 원격 Issue 본문에 게시해야 합니다.",
        )
    approval_matches_latest = (
        snapshot.approved_contract_digest is None
        or snapshot.latest_contract_digest is None
        or snapshot.approved_contract_digest == snapshot.latest_contract_digest
    )
    if not snapshot.approved or not approval_matches_latest:
        return PlanningAction(
            code="await_approval",
            reason="사람이 최신 원격 Issue 계약을 승인할 때까지 기다려야 합니다.",
        )
    if not snapshot.contract_valid:
        return PlanningAction(
            code="validate_latest_contract",
            reason="사람이 수정한 원격 Issue 계약을 다시 검증해야 합니다.",
        )
    if snapshot.issue_status_label != "status:ready":
        return PlanningAction(
            code="set_ready",
            reason="게시된 Issue 계약에 status:ready 라벨을 적용해야 합니다.",
        )
    return PlanningAction(
        code="complete",
        reason="Issue 기반 개발을 시작할 준비가 끝났습니다.",
    )
