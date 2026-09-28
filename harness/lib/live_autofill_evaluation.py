from dataclasses import dataclass


CANDIDATE_STATUSES = frozenset(
    ("available", "needs-review", "conflict", "sensitive", "unavailable")
)
EVALUATION_PHASES = frozenset(
    (
        "PRECHECK",
        "PREGRADING",
        "READY_TO_WRITE",
        "DOM_VERIFY",
        "REPORTED",
        "BLOCKED",
    )
)
WRITE_STATUSES = frozenset(("available", "needs-review", "conflict"))
DEFERRED_STATUSES = frozenset(("sensitive", "unavailable"))


class EvaluationError(ValueError):
    pass


@dataclass(frozen=True)
class CandidateState:
    candidate_id: str
    status: str

    def __post_init__(self) -> None:
        if not self.candidate_id:
            raise EvaluationError("candidate_id가 필요합니다")
        if self.status not in CANDIDATE_STATUSES:
            raise EvaluationError("후보 상태가 올바르지 않습니다")


@dataclass(frozen=True)
class EvaluationState:
    phase: str
    written_tab_ids: frozenset[str]

    def __post_init__(self) -> None:
        if self.phase not in EVALUATION_PHASES:
            raise EvaluationError("평가 단계가 올바르지 않습니다")
        if any(not tab_id for tab_id in self.written_tab_ids):
            raise EvaluationError("tab_id가 필요합니다")


def write_candidate_ids(entries: tuple[CandidateState, ...]) -> tuple[str, ...]:
    return tuple(entry.candidate_id for entry in entries if entry.status in WRITE_STATUSES)


def deferred_candidate_ids(entries: tuple[CandidateState, ...]) -> tuple[str, ...]:
    return tuple(
        entry.candidate_id for entry in entries if entry.status in DEFERRED_STATUSES
    )


def advance(
    state: EvaluationState,
    event: str,
    *,
    tab_id: str | None = None,
    current_run_approved: bool = False,
) -> EvaluationState:
    if event == "BLOCK":
        return EvaluationState("BLOCKED", state.written_tab_ids)
    if event == "PRECHECK_COMPLETED" and state.phase == "PRECHECK":
        return EvaluationState("PREGRADING", state.written_tab_ids)
    if event == "PREGRADING_COMPLETED" and state.phase == "PREGRADING":
        return EvaluationState("READY_TO_WRITE", state.written_tab_ids)
    if event == "WRITE":
        return _write(state, tab_id, current_run_approved)
    if event == "RESUME":
        return _resume(state, tab_id)
    if event == "DOM_VERIFIED" and state.phase == "DOM_VERIFY":
        return EvaluationState("REPORTED", state.written_tab_ids)
    raise EvaluationError("평가 상태 전환이 올바르지 않습니다")


def _write(
    state: EvaluationState,
    tab_id: str | None,
    current_run_approved: bool,
) -> EvaluationState:
    if not current_run_approved:
        raise EvaluationError("현재 실행의 쓰기 승인이 필요합니다")
    if state.phase != "READY_TO_WRITE" or not tab_id:
        raise EvaluationError("평가 상태 전환이 올바르지 않습니다")
    if tab_id in state.written_tab_ids:
        raise EvaluationError("이미 쓴 탭에는 다시 입력할 수 없습니다")
    return EvaluationState("DOM_VERIFY", state.written_tab_ids | frozenset((tab_id,)))


def _resume(state: EvaluationState, tab_id: str | None) -> EvaluationState:
    if not tab_id or tab_id not in state.written_tab_ids:
        raise EvaluationError("재개할 쓴 탭이 없습니다")
    return EvaluationState("DOM_VERIFY", state.written_tab_ids)
