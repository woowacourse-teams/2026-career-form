from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class LifecycleSnapshot:
    issue_number: int | None = None
    issue_status: str | None = None
    pull_request_state: str | None = None
    cleanup_complete: bool = False


@dataclass(frozen=True)
class LifecycleAction:
    code: str
    reason: str
    skill: str | None = None


def lifecycle_snapshot_from(payload: Mapping[str, object]) -> LifecycleSnapshot:
    issue_number = payload.get("issue_number")
    if issue_number is not None and (
        isinstance(issue_number, bool)
        or not isinstance(issue_number, int)
        or issue_number < 1
    ):
        raise ValueError("issue_number는 양의 정수여야 합니다")
    issue_status = _optional_string(payload, "issue_status")
    pull_request_state = _optional_string(payload, "pull_request_state")
    cleanup_complete = payload.get("cleanup_complete", False)
    if type(cleanup_complete) is not bool:
        raise ValueError("cleanup_complete는 boolean이어야 합니다")
    return LifecycleSnapshot(
        issue_number=issue_number,
        issue_status=issue_status,
        pull_request_state=pull_request_state,
        cleanup_complete=cleanup_complete,
    )


def _optional_string(payload: Mapping[str, object], name: str) -> str | None:
    value = payload.get(name)
    if value is not None and not isinstance(value, str):
        raise ValueError(f"{name}은 문자열이어야 합니다")
    return value


def next_lifecycle_action(snapshot: LifecycleSnapshot) -> LifecycleAction:
    if snapshot.issue_number is None or snapshot.issue_status in (
        None,
        "status:planning",
    ):
        return LifecycleAction(
            "plan_issue",
            "Issue 계약과 사람 승인이 필요합니다.",
            "cf-project-issue-planning",
        )
    if snapshot.issue_status in ("status:ready", "status:in-progress"):
        return LifecycleAction(
            "deliver_issue",
            "확정된 Issue를 구현하고 Draft PR을 만들어야 합니다.",
            "cf-issue-workflow",
        )
    if snapshot.issue_status == "status:blocked":
        return LifecycleAction(
            "await_unblock",
            "사람이 Issue 차단을 해제할 때까지 현재 상태를 유지해야 합니다.",
        )
    if snapshot.pull_request_state != "MERGED":
        return LifecycleAction(
            "await_merge",
            "사람의 PR 승인과 머지를 기다려야 합니다.",
        )
    if not snapshot.cleanup_complete:
        return LifecycleAction(
            "cleanup",
            "머지 증명 뒤 안전한 로컬 작업 대상을 정리해야 합니다.",
            "cf-post-merge-cleanup",
        )
    return LifecycleAction("complete", "Issue 생명주기가 완료되었습니다.")
