import re
from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class WorktreeState:
    path: str
    clean: bool
    managed: bool


@dataclass(frozen=True)
class CleanupSnapshot:
    issue_number: int
    issue_state: str
    pr_state: str
    head_branch: str
    base_branch: str
    merge_commit: str | None
    merge_in_origin_develop: bool
    local_branch_exists: bool
    worktrees: tuple[WorktreeState, ...]


@dataclass(frozen=True)
class CleanupPlan:
    status: str
    reason: str
    remove_worktrees: tuple[str, ...] = ()
    preserve_worktrees: tuple[str, ...] = ()
    delete_local_branch: bool = False


def cleanup_snapshot_from(payload: Mapping[str, object]) -> CleanupSnapshot:
    issue_number = payload.get("issue_number")
    if (
        isinstance(issue_number, bool)
        or not isinstance(issue_number, int)
        or issue_number < 1
    ):
        raise ValueError("issue_number는 양의 정수여야 합니다")
    strings = {
        name: _required_string(payload, name)
        for name in ("issue_state", "pr_state", "head_branch", "base_branch")
    }
    merge_commit = payload.get("merge_commit")
    if merge_commit is not None and not isinstance(merge_commit, str):
        raise ValueError("merge_commit은 문자열이어야 합니다")
    merge_in_origin_develop = _required_boolean(
        payload, "merge_in_origin_develop"
    )
    local_branch_exists = _required_boolean(payload, "local_branch_exists")
    raw_worktrees = payload.get("worktrees")
    if not isinstance(raw_worktrees, list):
        raise ValueError("worktrees는 목록이어야 합니다")
    worktrees = tuple(_worktree_from(item) for item in raw_worktrees)
    return CleanupSnapshot(
        issue_number=issue_number,
        merge_commit=merge_commit,
        merge_in_origin_develop=merge_in_origin_develop,
        local_branch_exists=local_branch_exists,
        worktrees=worktrees,
        **strings,
    )


def _required_string(payload: Mapping[str, object], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name}은 문자열이어야 합니다")
    return value


def _required_boolean(payload: Mapping[str, object], name: str) -> bool:
    value = payload.get(name)
    if type(value) is not bool:
        raise ValueError(f"{name}은 boolean이어야 합니다")
    return value


def _worktree_from(value: object) -> WorktreeState:
    if not isinstance(value, Mapping):
        raise ValueError("worktree 항목은 객체여야 합니다")
    return WorktreeState(
        path=_required_string(value, "path"),
        clean=_required_boolean(value, "clean"),
        managed=_required_boolean(value, "managed"),
    )


def plan_cleanup(snapshot: CleanupSnapshot) -> CleanupPlan:
    expected_branch = f"CF-{snapshot.issue_number}"
    proof_errors: list[str] = []
    if snapshot.pr_state != "MERGED":
        proof_errors.append("PR이 MERGED 상태가 아닙니다")
    if snapshot.head_branch != expected_branch or snapshot.base_branch != "develop":
        proof_errors.append("PR 브랜치 연결이 Issue 계약과 다릅니다")
    if snapshot.issue_state != "CLOSED":
        proof_errors.append("연결 Issue가 닫히지 않았습니다")
    if not snapshot.merge_commit or re.fullmatch(
        r"[0-9a-f]{40}", snapshot.merge_commit
    ) is None:
        proof_errors.append("PR merge commit을 확인할 수 없습니다")
    if not snapshot.merge_in_origin_develop:
        proof_errors.append("merge commit이 origin/develop에 포함되지 않았습니다")
    if proof_errors:
        return CleanupPlan("blocked", "; ".join(proof_errors))

    removable = tuple(
        worktree.path
        for worktree in snapshot.worktrees
        if worktree.clean and worktree.managed
    )
    preserved = tuple(
        worktree.path
        for worktree in snapshot.worktrees
        if not worktree.clean or not worktree.managed
    )
    delete_branch = snapshot.local_branch_exists and not preserved
    if not removable and not delete_branch:
        return CleanupPlan(
            "complete",
            "안전하게 정리할 로컬 대상이 이미 없습니다.",
            preserve_worktrees=preserved,
        )
    return CleanupPlan(
        "ready",
        "원격 머지와 안전 판정이 확인되었습니다.",
        remove_worktrees=removable,
        preserve_worktrees=preserved,
        delete_local_branch=delete_branch,
    )
