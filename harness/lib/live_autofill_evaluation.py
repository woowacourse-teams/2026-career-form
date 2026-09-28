import re
from dataclasses import dataclass

from harness.lib.generic_autofill_eval import CLASSIFICATIONS, Metric


CANDIDATE_STATUSES = frozenset(
    ("available", "needs-review", "conflict", "sensitive", "unavailable")
)
EVALUATION_PHASES = frozenset(
    (
        "PRECHECK",
        "PREGRADING",
        "READY_TO_WRITE",
        "DOM_VERIFY",
        "REPORTING",
        "REPORTED",
        "BLOCKED",
    )
)
WRITE_STATUSES = frozenset(("available", "needs-review", "conflict"))
DEFERRED_STATUSES = frozenset(("sensitive", "unavailable"))
GROUND_TRUTH_CREATORS = frozenset(("evaluation-agent",))
REVISION_STATUSES = frozenset(("VERIFIED", "UNVERIFIED"))
PROFILE_MODES = frozenset(("IMPORTED_FIXTURE", "EXISTING_PROFILE"))
STABLE_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DIGEST_PATTERN = re.compile(r"^[a-f0-9]{64}$")


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
class PregradedField:
    field_id: str
    classification: str

    def __post_init__(self) -> None:
        if not STABLE_ID_PATTERN.fullmatch(self.field_id):
            raise EvaluationError("field_id는 익명 안정 ID여야 합니다")
        if self.classification not in CLASSIFICATIONS:
            raise EvaluationError("필드 분류가 올바르지 않습니다")


@dataclass(frozen=True)
class PregradedSite:
    site_id: str
    fields: tuple[PregradedField, ...]
    ground_truth_creator: str
    human_reviewed: bool

    def __post_init__(self) -> None:
        if not STABLE_ID_PATTERN.fullmatch(self.site_id):
            raise EvaluationError("site_id는 공개 안정 ID여야 합니다")
        if not self.fields:
            raise EvaluationError("사전 판정 필드는 비어 있을 수 없습니다")
        field_ids = tuple(field.field_id for field in self.fields)
        if len(field_ids) != len(frozenset(field_ids)):
            raise EvaluationError("field_id는 중복될 수 없습니다")
        if self.ground_truth_creator not in GROUND_TRUTH_CREATORS:
            raise EvaluationError("정답 기준 생성 주체는 evaluation-agent여야 합니다")
        if self.autofillable_count == 0:
            raise EvaluationError("AUTOFILLABLE 분모는 0일 수 없습니다")

    @property
    def total_field_count(self) -> int:
        return len(self.fields)

    @property
    def autofillable_count(self) -> int:
        return sum(field.classification == "AUTOFILLABLE" for field in self.fields)


@dataclass(frozen=True)
class SiteEvaluationResult:
    discovered_count: int
    proposed_count: int
    correct_mapping_count: int
    correct_bound_count: int
    written_count: int
    retained_count: int
    deferred_count: int
    failed_count: int
    incorrect_write_count: int

    def __post_init__(self) -> None:
        counts = (
            self.discovered_count,
            self.proposed_count,
            self.correct_mapping_count,
            self.correct_bound_count,
            self.written_count,
            self.retained_count,
            self.deferred_count,
            self.failed_count,
            self.incorrect_write_count,
        )
        if any(type(count) is not int or count < 0 for count in counts):
            raise EvaluationError("평가 개수는 0 이상의 정수여야 합니다")
        if self.correct_mapping_count > self.proposed_count:
            raise EvaluationError("정답 매핑 수는 제안 수를 넘을 수 없습니다")
        if self.correct_bound_count > self.correct_mapping_count:
            raise EvaluationError("정답 바인딩 수는 정답 매핑 수를 넘을 수 없습니다")
        if self.retained_count > self.correct_bound_count:
            raise EvaluationError("유지 수는 정답 바인딩 수를 넘을 수 없습니다")
        if self.incorrect_write_count > self.written_count:
            raise EvaluationError("오입력 수는 쓰기 수를 넘을 수 없습니다")


@dataclass(frozen=True)
class ReportRecord:
    report_id: str
    site_ids: frozenset[str]
    knowledge_approval_digest: str
    wiki_validated: bool

    def __post_init__(self) -> None:
        if not STABLE_ID_PATTERN.fullmatch(self.report_id):
            raise EvaluationError("report_id는 안정 ID여야 합니다")
        if not self.site_ids or any(
            STABLE_ID_PATTERN.fullmatch(site_id) is None for site_id in self.site_ids
        ):
            raise EvaluationError("보고서 site_id가 올바르지 않습니다")
        if not DIGEST_PATTERN.fullmatch(self.knowledge_approval_digest):
            raise EvaluationError("지식 승인 digest가 올바르지 않습니다")


@dataclass(frozen=True)
class ReportMetadata:
    product_revision: str
    product_revision_status: str
    contract_version: str
    profile_mode: str
    profile_version: str

    def __post_init__(self) -> None:
        required = (
            self.product_revision,
            self.contract_version,
            self.profile_version,
        )
        if not all(required):
            raise EvaluationError("보고서 메타데이터가 필요합니다")
        if self.product_revision_status not in REVISION_STATUSES:
            raise EvaluationError("제품 revision 검증 상태가 올바르지 않습니다")
        if self.profile_mode not in PROFILE_MODES:
            raise EvaluationError("프로필 mode가 올바르지 않습니다")


@dataclass(frozen=True)
class EvaluationState:
    phase: str
    written_tab_ids: frozenset[str]
    pregraded_site_ids: frozenset[str] = frozenset()

    def __post_init__(self) -> None:
        if self.phase not in EVALUATION_PHASES:
            raise EvaluationError("평가 단계가 올바르지 않습니다")
        if any(not tab_id for tab_id in self.written_tab_ids):
            raise EvaluationError("tab_id가 필요합니다")
        if any(not site_id for site_id in self.pregraded_site_ids):
            raise EvaluationError("site_id가 필요합니다")


def write_candidate_ids(entries: tuple[CandidateState, ...]) -> tuple[str, ...]:
    return tuple(entry.candidate_id for entry in entries if entry.status in WRITE_STATUSES)


def deferred_candidate_ids(entries: tuple[CandidateState, ...]) -> tuple[str, ...]:
    return tuple(
        entry.candidate_id for entry in entries if entry.status in DEFERRED_STATUSES
    )


def build_site_report(
    site: PregradedSite,
    result: SiteEvaluationResult,
    metadata: ReportMetadata,
) -> dict[str, object]:
    if result.correct_mapping_count > site.autofillable_count:
        raise EvaluationError("정답 매핑 수는 AUTOFILLABLE 분모를 넘을 수 없습니다")
    if result.retained_count > site.autofillable_count:
        raise EvaluationError("유지 수는 AUTOFILLABLE 분모를 넘을 수 없습니다")
    classification_counts = {
        classification: sum(
            field.classification == classification for field in site.fields
        )
        for classification in CLASSIFICATIONS
    }
    return {
        "site_id": site.site_id,
        "ground_truth_creator": site.ground_truth_creator,
        "human_reviewed": site.human_reviewed,
        "total_field_count": site.total_field_count,
        "autofillable_count": site.autofillable_count,
        "classification_counts": classification_counts,
        "product_revision": metadata.product_revision,
        "product_revision_status": metadata.product_revision_status,
        "contract_version": metadata.contract_version,
        "profile_mode": metadata.profile_mode,
        "profile_version": metadata.profile_version,
        "stage_counts": {
            "DISCOVERED": result.discovered_count,
            "PROPOSED": result.proposed_count,
            "CORRECT_MAPPING": result.correct_mapping_count,
            "CORRECT_BOUND": result.correct_bound_count,
            "WRITTEN": result.written_count,
            "RETAINED": result.retained_count,
            "DEFERRED": result.deferred_count,
            "FAILED": result.failed_count,
            "INCORRECT_WRITE": result.incorrect_write_count,
        },
        "metrics": {
            "mapping_precision": Metric(
                result.correct_mapping_count,
                result.proposed_count,
            ).render(),
            "mapping_recall": Metric(
                result.correct_mapping_count,
                site.autofillable_count,
            ).render(),
            "correct_input_rate": Metric(
                result.retained_count,
                site.autofillable_count,
            ).render(),
            "execution_retention_rate": Metric(
                result.retained_count,
                result.correct_bound_count,
            ).render(),
            "miswrite_rate": Metric(
                result.incorrect_write_count,
                result.written_count,
            ).render(),
        },
    }


def advance(
    state: EvaluationState,
    event: str,
    *,
    tab_id: str | None = None,
    current_run_approved: bool = False,
    pregraded_sites: tuple[PregradedSite, ...] = (),
    report_record: ReportRecord | None = None,
) -> EvaluationState:
    if event == "BLOCK":
        return _with_phase(state, "BLOCKED")
    if event == "PRECHECK_COMPLETED" and state.phase == "PRECHECK":
        return _with_phase(state, "PREGRADING")
    if event == "PREGRADING_COMPLETED" and state.phase == "PREGRADING":
        return _complete_pregrading(state, pregraded_sites)
    if event == "WRITE":
        return _write(state, tab_id, current_run_approved)
    if event == "RESUME":
        return _resume(state, tab_id)
    if event == "DOM_VERIFIED":
        return _dom_verified(state, tab_id)
    if event == "REPORT_RECORDED":
        return _report_recorded(state, report_record)
    raise EvaluationError("평가 상태 전환이 올바르지 않습니다")


def _with_phase(state: EvaluationState, phase: str) -> EvaluationState:
    return EvaluationState(phase, state.written_tab_ids, state.pregraded_site_ids)


def _complete_pregrading(
    state: EvaluationState,
    sites: tuple[PregradedSite, ...],
) -> EvaluationState:
    if not sites:
        raise EvaluationError("평가 에이전트의 사전 판정이 필요합니다")
    site_ids = tuple(site.site_id for site in sites)
    if len(site_ids) != len(frozenset(site_ids)):
        raise EvaluationError("site_id는 중복될 수 없습니다")
    return EvaluationState(
        "READY_TO_WRITE",
        state.written_tab_ids,
        frozenset(site_ids),
    )


def _write(
    state: EvaluationState,
    tab_id: str | None,
    current_run_approved: bool,
) -> EvaluationState:
    if not current_run_approved:
        raise EvaluationError("현재 실행의 쓰기 승인이 필요합니다")
    if state.phase != "READY_TO_WRITE" or not tab_id:
        raise EvaluationError("평가 상태 전환이 올바르지 않습니다")
    if not state.pregraded_site_ids:
        raise EvaluationError("평가 에이전트의 사전 판정이 필요합니다")
    if tab_id in state.written_tab_ids:
        raise EvaluationError("이미 쓴 탭에는 다시 입력할 수 없습니다")
    return EvaluationState(
        "DOM_VERIFY",
        state.written_tab_ids | frozenset((tab_id,)),
        state.pregraded_site_ids,
    )


def _resume(state: EvaluationState, tab_id: str | None) -> EvaluationState:
    if not tab_id or tab_id not in state.written_tab_ids:
        raise EvaluationError("재개할 쓴 탭이 없습니다")
    return _with_phase(state, "DOM_VERIFY")


def _dom_verified(
    state: EvaluationState,
    tab_id: str | None,
) -> EvaluationState:
    if state.phase != "DOM_VERIFY":
        raise EvaluationError("평가 상태 전환이 올바르지 않습니다")
    if not tab_id or tab_id not in state.written_tab_ids:
        raise EvaluationError("DOM을 검증할 쓴 탭이 없습니다")
    return _with_phase(state, "REPORTING")


def _report_recorded(
    state: EvaluationState,
    report_record: ReportRecord | None,
) -> EvaluationState:
    if state.phase != "REPORTING":
        raise EvaluationError("평가 상태 전환이 올바르지 않습니다")
    if report_record is None:
        raise EvaluationError("비식별 보고서 기록이 필요합니다")
    if not report_record.wiki_validated:
        raise EvaluationError("Wiki 구조 검증이 필요합니다")
    if report_record.site_ids != state.pregraded_site_ids:
        raise EvaluationError("사전 판정 사이트와 보고서 사이트가 다릅니다")
    return _with_phase(state, "REPORTED")
