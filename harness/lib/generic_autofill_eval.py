from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from harness.lib.evaluation_revision import RevisionEvidence


CONTRACT_VERSION = "1.1"
SOURCES = ("LIVE_SITE", "FIXTURE")
RUN_STATUSES = ("MEASURED", "INCONCLUSIVE")
CLASSIFICATIONS = (
    "AUTOFILLABLE",
    "CONDITIONAL",
    "PROFILE_VALUE_MISSING",
    "FORBIDDEN",
    "CREATED_AFTER_ACTION",
)
CLASSIFICATION_REASONS = (
    "PROFILE_VALUE_AVAILABLE",
    "CONDITION_NOT_ACTIVE",
    "PROFILE_VALUE_UNAVAILABLE",
    "SENSITIVE_FIELD",
    "ACTION_REQUIRED",
)
CONTROL_KINDS = (
    "TEXT",
    "TEXTAREA",
    "SELECT",
    "RADIO",
    "CHECKBOX",
    "FILE",
    "CUSTOM",
)
STAGES = ("DISCOVERED", "MAPPED", "BOUND", "WRITTEN", "RETAINED")
MAPPING_RESULTS = ("CORRECT", "INCORRECT")
WRITE_RESULTS = ("CORRECT", "INCORRECT")
TERMINAL_RESULTS = ("DEFERRED", "FAILED")
REASON_CODES = (
    "MAPPING_NO_MATCH",
    "MAPPING_INCORRECT",
    "PROFILE_VALUE_MISSING",
    "BINDING_UNSUPPORTED",
    "WRITE_BLOCKED",
    "WRITE_FAILED",
    "RETENTION_FAILED",
    "EXISTING_VALUE_PROTECTED",
    "USER_NOT_APPROVED",
    "CONDITIONAL_NOT_REVEALED",
    "UNSUPPORTED_CONTROL",
)
INCONCLUSIVE_REASONS = (
    "PAGE_UNAVAILABLE",
    "FORM_CLOSED",
    "STRUCTURE_CHANGED",
    "MANUAL_VERIFICATION_UNAVAILABLE",
)


class EvaluationError(ValueError):
    pass


@dataclass(frozen=True)
class GroundTruthField:
    field_id: str
    classification: str
    classification_reason: str
    control_kind: str


@dataclass(frozen=True)
class GroundTruthSite:
    site_id: str
    fields: tuple[GroundTruthField, ...]

    @property
    def autofillable_count(self) -> int:
        return sum(field.classification == "AUTOFILLABLE" for field in self.fields)

    @property
    def field_ids(self) -> frozenset[str]:
        return frozenset(field.field_id for field in self.fields)


@dataclass(frozen=True)
class GroundTruth:
    profile_version: str
    sites: tuple[GroundTruthSite, ...]

    @property
    def by_id(self) -> dict[str, GroundTruthSite]:
        return {site.site_id: site for site in self.sites}


@dataclass(frozen=True)
class Usage:
    provider_calls: int
    input_tokens: int
    output_tokens: int
    cost_usd: float | None
    duration_ms: int


@dataclass(frozen=True)
class CandidateObservation:
    candidate_id: str
    field_id: str
    stages: tuple[str, ...]
    mapping_result: str | None
    write_result: str | None
    terminal_result: str | None
    reason_code: str | None
    existing_value_changed: bool


@dataclass(frozen=True)
class RunObservation:
    site_id: str
    source: str
    status: str
    revision: str
    revision_status: str
    revision_evidence: RevisionEvidence
    provider: str
    model: str
    timeout_ms: int
    max_output_tokens: int
    profile_version: str
    initial_state: str
    inconclusive_reason: str | None
    usage: Usage
    candidates: tuple[CandidateObservation, ...]


@dataclass(frozen=True)
class EvidenceReference:
    site_id: str
    candidate_id: str
    field_id: str
    reason_code: str


@dataclass(frozen=True)
class FollowUpPriority:
    item_id: str
    title: str
    priority: int
    evidence: tuple[EvidenceReference, ...]


@dataclass(frozen=True)
class Observations:
    runs: tuple[RunObservation, ...]
    follow_up_priorities: tuple[FollowUpPriority, ...]


@dataclass(frozen=True)
class Metric:
    numerator: int
    denominator: int

    def render(self) -> dict[str, int | float | None]:
        rate = self.numerator / self.denominator if self.denominator else None
        return {
            "numerator": self.numerator,
            "denominator": self.denominator,
            "rate": rate,
        }


def evaluate_generic_autofill(
    ground_truth: Mapping[str, object],
    observations: Mapping[str, object],
) -> dict[str, object]:
    truth = validate_ground_truth(ground_truth)
    runs = validate_observations(observations, truth)
    return _render_evaluation(truth, runs)


def validate_ground_truth(payload: Mapping[str, object]) -> GroundTruth:
    value = _mapping(payload, "ground truth")
    _keys(value, {"contract_version", "profile_version", "sites"}, "ground truth")
    _version(value.get("contract_version"))
    profile_version = _string(value.get("profile_version"), "profile_version")
    sites = tuple(_parse_site(item) for item in _list(value.get("sites"), "sites"))
    if not sites:
        raise EvaluationError("sites는 비어 있을 수 없습니다")
    _unique((site.site_id for site in sites), "site_id")
    return GroundTruth(profile_version=profile_version, sites=sites)


def validate_observations(
    payload: Mapping[str, object], truth: GroundTruth
) -> Observations:
    value = _mapping(payload, "observations")
    _keys(value, {"contract_version", "runs", "follow_up_priorities"}, "observations")
    _version(value.get("contract_version"))
    runs = tuple(_parse_run(item, truth) for item in _list(value.get("runs"), "runs"))
    _validate_run_coverage(runs, truth)
    priorities = tuple(
        _parse_priority(item)
        for item in _list(value.get("follow_up_priorities"), "follow_up_priorities")
    )
    _validate_priorities(priorities, runs)
    return Observations(runs=runs, follow_up_priorities=priorities)


def _parse_site(payload: object) -> GroundTruthSite:
    value = _mapping(payload, "site")
    _keys(value, {"site_id", "fields"}, "site")
    site_id = _string(value.get("site_id"), "site_id")
    fields = tuple(_parse_field(item) for item in _list(value.get("fields"), "fields"))
    if not fields:
        raise EvaluationError(f"{site_id} fields는 비어 있을 수 없습니다")
    _unique((field.field_id for field in fields), f"{site_id} field_id")
    site = GroundTruthSite(site_id=site_id, fields=fields)
    if site.autofillable_count == 0:
        raise EvaluationError(f"{site_id}의 AUTOFILLABLE 분모는 0일 수 없습니다")
    return site


def _parse_field(payload: object) -> GroundTruthField:
    value = _mapping(payload, "field")
    expected = {
        "field_id",
        "classification",
        "classification_reason",
        "control_kind",
    }
    _keys(value, expected, "field")
    return GroundTruthField(
        field_id=_string(value.get("field_id"), "field_id"),
        classification=_enum(value.get("classification"), CLASSIFICATIONS, "classification"),
        classification_reason=_enum(
            value.get("classification_reason"),
            CLASSIFICATION_REASONS,
            "classification_reason",
        ),
        control_kind=_enum(value.get("control_kind"), CONTROL_KINDS, "control_kind"),
    )


def _parse_run(payload: object, truth: GroundTruth) -> RunObservation:
    value = _mapping(payload, "run")
    expected = {
        "site_id",
        "source",
        "status",
        "revision",
        "revision_status",
        "revision_evidence",
        "provider",
        "model",
        "timeout_ms",
        "max_output_tokens",
        "profile_version",
        "initial_state",
        "inconclusive_reason",
        "usage",
        "candidates",
    }
    _keys(value, expected, "run")
    site_id = _string(value.get("site_id"), "site_id")
    site = truth.by_id.get(site_id)
    if site is None:
        raise EvaluationError(f"알 수 없는 site_id입니다: {site_id}")
    source = _enum(value.get("source"), SOURCES, "source")
    evidence = RevisionEvidence.parse(value.get("revision_evidence"), source)
    evidence.validate_claim(value.get("revision"), value.get("revision_status"))
    run = RunObservation(
        site_id=site_id,
        source=source,
        status=_enum(value.get("status"), RUN_STATUSES, "status"),
        revision=_string(value.get("revision"), "revision"),
        revision_status=_enum(
            value.get("revision_status"), ("VERIFIED", "UNVERIFIED"), "revision_status"
        ),
        revision_evidence=evidence,
        provider=_string(value.get("provider"), "provider"),
        model=_string(value.get("model"), "model"),
        timeout_ms=_positive_int(value.get("timeout_ms"), "timeout_ms"),
        max_output_tokens=_positive_int(
            value.get("max_output_tokens"), "max_output_tokens"
        ),
        profile_version=_string(value.get("profile_version"), "profile_version"),
        initial_state=_string(value.get("initial_state"), "initial_state"),
        inconclusive_reason=_optional_enum(
            value.get("inconclusive_reason"),
            INCONCLUSIVE_REASONS,
            "inconclusive_reason",
        ),
        usage=_parse_usage(value.get("usage")),
        candidates=parse_site_candidates(value.get("candidates"), site),
    )
    _validate_run(run, truth)
    return run


def _parse_usage(payload: object) -> Usage:
    value = _mapping(payload, "usage")
    expected = {
        "provider_calls",
        "input_tokens",
        "output_tokens",
        "cost_usd",
        "duration_ms",
    }
    _keys(value, expected, "usage")
    cost = value.get("cost_usd")
    if cost is not None and (type(cost) not in (int, float) or cost <= 0):
        raise EvaluationError("cost_usd는 null 또는 양수여야 합니다")
    usage = Usage(
        provider_calls=_non_negative_int(value.get("provider_calls"), "provider_calls"),
        input_tokens=_non_negative_int(value.get("input_tokens"), "input_tokens"),
        output_tokens=_non_negative_int(value.get("output_tokens"), "output_tokens"),
        cost_usd=float(cost) if cost is not None else None,
        duration_ms=_non_negative_int(value.get("duration_ms"), "duration_ms"),
    )
    if usage.provider_calls == 0 and (usage.input_tokens or usage.output_tokens):
        raise EvaluationError("provider 호출이 없으면 token 사용량은 0이어야 합니다")
    return usage


def _parse_candidate(payload: object, site: GroundTruthSite) -> CandidateObservation:
    value = _mapping(payload, "candidate")
    expected = {
        "candidate_id",
        "field_id",
        "stages",
        "mapping_result",
        "write_result",
        "terminal_result",
        "reason_code",
        "existing_value_changed",
    }
    _keys(value, expected, "candidate")
    field_id = _string(value.get("field_id"), "field_id")
    if field_id not in site.field_ids:
        raise EvaluationError(f"{site.site_id}에 없는 field_id입니다: {field_id}")
    candidate = CandidateObservation(
        candidate_id=_string(value.get("candidate_id"), "candidate_id"),
        field_id=field_id,
        stages=tuple(
            _enum(item, STAGES, "stage")
            for item in _list(value.get("stages"), "stages")
        ),
        mapping_result=_optional_enum(
            value.get("mapping_result"), MAPPING_RESULTS, "mapping_result"
        ),
        write_result=_optional_enum(
            value.get("write_result"), WRITE_RESULTS, "write_result"
        ),
        terminal_result=_optional_enum(
            value.get("terminal_result"), TERMINAL_RESULTS, "terminal_result"
        ),
        reason_code=_optional_enum(
            value.get("reason_code"), REASON_CODES, "reason_code"
        ),
        existing_value_changed=_boolean(
            value.get("existing_value_changed"), "existing_value_changed"
        ),
    )
    _validate_candidate(candidate)
    return candidate


def parse_site_candidates(
    payload: object, site: GroundTruthSite
) -> tuple[CandidateObservation, ...]:
    candidates = tuple(
        _parse_candidate(item, site) for item in _list(payload, "candidates")
    )
    _unique(tuple(candidate.candidate_id for candidate in candidates), "candidate_id")
    _unique(tuple(candidate.field_id for candidate in candidates), "observed field_id")
    return candidates


def _validate_candidate(candidate: CandidateObservation) -> None:
    if not candidate.stages or candidate.stages != STAGES[: len(candidate.stages)]:
        raise EvaluationError("candidate stages는 순차 prefix여야 합니다")
    mapped = "MAPPED" in candidate.stages
    written = "WRITTEN" in candidate.stages
    retained = "RETAINED" in candidate.stages
    if mapped != (candidate.mapping_result is not None):
        raise EvaluationError("MAPPED 단계와 mapping_result가 일치해야 합니다")
    if written != (candidate.write_result is not None):
        raise EvaluationError("WRITTEN 단계와 write_result가 일치해야 합니다")
    if candidate.terminal_result is None and candidate.reason_code is not None:
        raise EvaluationError("reason_code에는 terminal_result가 필요합니다")
    if candidate.terminal_result is not None and candidate.reason_code is None:
        raise EvaluationError("terminal_result에는 reason_code가 필요합니다")
    if retained and candidate.terminal_result is not None:
        raise EvaluationError("RETAINED candidate는 terminal_result를 가질 수 없습니다")
    if not retained and candidate.terminal_result is None:
        raise EvaluationError("미완료 candidate에는 terminal_result가 필요합니다")
    if retained and candidate.write_result != "CORRECT":
        raise EvaluationError("RETAINED candidate의 write_result는 CORRECT여야 합니다")
    if candidate.existing_value_changed and not written:
        raise EvaluationError("기존 값 훼손은 WRITTEN 단계에서만 기록할 수 있습니다")


def _validate_run(run: RunObservation, truth: GroundTruth) -> None:
    if run.profile_version != truth.profile_version:
        raise EvaluationError("run profile_version이 ground truth와 다릅니다")
    if run.status == "MEASURED":
        if run.inconclusive_reason is not None:
            raise EvaluationError("MEASURED run에는 inconclusive_reason을 쓸 수 없습니다")
    if run.status == "INCONCLUSIVE":
        if run.inconclusive_reason is None:
            raise EvaluationError("INCONCLUSIVE run에는 사유가 필요합니다")
        if run.candidates:
            raise EvaluationError("INCONCLUSIVE run에는 candidate를 기록할 수 없습니다")


def _validate_run_coverage(
    runs: tuple[RunObservation, ...], truth: GroundTruth
) -> None:
    actual = tuple((run.source, run.site_id) for run in runs)
    _unique(actual, "source/site run")
    expected = {(source, site.site_id) for source in SOURCES for site in truth.sites}
    if set(actual) != expected:
        raise EvaluationError("모든 source와 site 조합의 run이 필요합니다")


def _parse_priority(payload: object) -> FollowUpPriority:
    value = _mapping(payload, "follow_up_priority")
    _keys(value, {"item_id", "title", "priority", "evidence"}, "follow_up_priority")
    evidence = tuple(
        _parse_evidence(item) for item in _list(value.get("evidence"), "evidence")
    )
    if not evidence:
        raise EvaluationError("follow-up priority에는 evidence가 필요합니다")
    return FollowUpPriority(
        item_id=_string(value.get("item_id"), "item_id"),
        title=_string(value.get("title"), "title"),
        priority=_positive_int(value.get("priority"), "priority"),
        evidence=evidence,
    )


def _parse_evidence(payload: object) -> EvidenceReference:
    value = _mapping(payload, "evidence")
    expected = {"site_id", "candidate_id", "field_id", "reason_code"}
    _keys(value, expected, "evidence")
    return EvidenceReference(
        site_id=_string(value.get("site_id"), "site_id"),
        candidate_id=_string(value.get("candidate_id"), "candidate_id"),
        field_id=_string(value.get("field_id"), "field_id"),
        reason_code=_enum(value.get("reason_code"), REASON_CODES, "reason_code"),
    )


def _validate_priorities(
    priorities: tuple[FollowUpPriority, ...], runs: tuple[RunObservation, ...]
) -> None:
    if len(priorities) > 3:
        raise EvaluationError("follow-up priority는 최대 3개입니다")
    _unique((priority.item_id for priority in priorities), "follow-up item_id")
    _unique((priority.priority for priority in priorities), "follow-up priority")
    if priorities and {priority.priority for priority in priorities} != set(
        range(1, len(priorities) + 1)
    ):
        raise EvaluationError("follow-up priority는 1부터 연속이어야 합니다")
    live = {
        (run.site_id, candidate.candidate_id, candidate.field_id, candidate.reason_code)
        for run in runs
        if run.source == "LIVE_SITE"
        for candidate in run.candidates
        if candidate.reason_code is not None
    }
    for priority in priorities:
        for evidence in priority.evidence:
            key = (
                evidence.site_id,
                evidence.candidate_id,
                evidence.field_id,
                evidence.reason_code,
            )
            if key not in live:
                raise EvaluationError("follow-up evidence가 LIVE_SITE 관측과 일치하지 않습니다")


def _render_evaluation(
    truth: GroundTruth, observations: Observations
) -> dict[str, object]:
    return {
        "contract_version": CONTRACT_VERSION,
        "profile_version": truth.profile_version,
        "sources": {
            source: _render_source(source, truth, observations.runs)
            for source in SOURCES
        },
        "follow_up_priorities": [
            _render_priority(priority)
            for priority in sorted(
                observations.follow_up_priorities, key=lambda item: item.priority
            )
        ],
    }


def _render_source(
    source: str, truth: GroundTruth, runs: tuple[RunObservation, ...]
) -> dict[str, object]:
    selected = tuple(run for run in runs if run.source == source)
    sites = {
        run.site_id: _render_site(run, truth.by_id[run.site_id])
        for run in sorted(selected, key=lambda item: item.site_id)
    }
    measured = tuple(run for run in selected if run.status == "MEASURED")
    return {
        "measured_sites": len(measured),
        "inconclusive_sites": len(selected) - len(measured),
        "sites": sites,
        "overall": _render_metrics(measured, truth),
    }


def _render_site(run: RunObservation, site: GroundTruthSite) -> dict[str, object]:
    metadata = {
        "status": run.status,
        "revision": run.revision,
        "revision_status": run.revision_status,
        "revision_evidence": run.revision_evidence.render(),
        "provider": run.provider,
        "model": run.model,
        "timeout_ms": run.timeout_ms,
        "max_output_tokens": run.max_output_tokens,
        "profile_version": run.profile_version,
        "initial_state": run.initial_state,
        "inconclusive_reason": run.inconclusive_reason,
    }
    if run.status == "INCONCLUSIVE":
        return {
            **metadata, "metrics": None, "usage": _render_usage((run,)),
            "reason_counts": None, "reason_evidence": None,
            "undiscovered_autofillable_count": None,
        }
    return {**metadata, **_render_metrics((run,), GroundTruth("", (site,)))}


def _render_metrics(
    runs: tuple[RunObservation, ...], truth: GroundTruth
) -> dict[str, object]:
    candidates = tuple(candidate for run in runs for candidate in run.candidates)
    site_ids = {run.site_id for run in runs}
    autofillable = sum(
        site.autofillable_count for site in truth.sites if site.site_id in site_ids
    )
    proposed = sum("MAPPED" in candidate.stages for candidate in candidates)
    correct = sum(candidate.mapping_result == "CORRECT" for candidate in candidates)
    bound = sum(
        candidate.mapping_result == "CORRECT" and "BOUND" in candidate.stages
        for candidate in candidates
    )
    retained = sum(
        candidate.mapping_result == "CORRECT" and "RETAINED" in candidate.stages
        for candidate in candidates
    )
    writes = sum("WRITTEN" in candidate.stages for candidate in candidates)
    miswrites = sum(candidate.write_result == "INCORRECT" for candidate in candidates)
    return {
        "mapping_precision": Metric(correct, proposed).render(),
        "mapping_recall": Metric(correct, autofillable).render(),
        "correct_input_rate": Metric(retained, autofillable).render(),
        "execution_retention_rate": Metric(retained, bound).render(),
        "miswrite_rate": Metric(miswrites, writes).render(),
        "existing_value_damage": sum(
            candidate.existing_value_changed for candidate in candidates
        ),
        "stage_counts": {
            stage: sum(stage in candidate.stages for candidate in candidates)
            for stage in STAGES
        }
        | {
            result: sum(
                candidate.terminal_result == result for candidate in candidates
            )
            for result in TERMINAL_RESULTS
        },
        "usage": _render_usage(runs),
        **summarize_outcomes({run.site_id: run.candidates for run in runs}, truth),
    }


def summarize_outcomes(
    observations: Mapping[str, tuple[CandidateObservation, ...]], truth: GroundTruth
) -> dict[str, object]:
    candidates = tuple(item for items in observations.values() for item in items)
    return {
        "reason_counts": {
            result: {
                reason: sum(
                    candidate.terminal_result == result and candidate.reason_code == reason
                    for candidate in candidates
                )
                for reason in REASON_CODES
            }
            for result in TERMINAL_RESULTS
        } if observations else None,
        "reason_evidence": [
            {
                "site_id": site_id,
                "candidate_id": candidate.candidate_id,
                "field_id": candidate.field_id,
                "terminal_result": candidate.terminal_result,
                "reason_code": candidate.reason_code,
            }
            for site_id, items in sorted(observations.items())
            for candidate in sorted(items, key=lambda item: item.candidate_id)
            if candidate.terminal_result is not None
        ] if observations else None,
        "undiscovered_autofillable_count": sum(
            len({
                field.field_id for field in truth.by_id[site_id].fields
                if field.classification == "AUTOFILLABLE"
            } - {candidate.field_id for candidate in items})
            for site_id, items in observations.items()
        ) if observations else None,
    }


def _render_usage(runs: tuple[RunObservation, ...]) -> dict[str, object]:
    costs = tuple(run.usage.cost_usd for run in runs)
    return {
        "provider_calls": sum(run.usage.provider_calls for run in runs),
        "input_tokens": sum(run.usage.input_tokens for run in runs),
        "output_tokens": sum(run.usage.output_tokens for run in runs),
        "cost_usd": sum(costs) if costs and all(cost is not None for cost in costs) else None,
        "duration_ms": sum(run.usage.duration_ms for run in runs),
    }


def _render_priority(priority: FollowUpPriority) -> dict[str, object]:
    return {
        "item_id": priority.item_id,
        "title": priority.title,
        "priority": priority.priority,
        "evidence": [
            {
                "site_id": evidence.site_id,
                "candidate_id": evidence.candidate_id,
                "field_id": evidence.field_id,
                "reason_code": evidence.reason_code,
            }
            for evidence in priority.evidence
        ],
    }


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise EvaluationError(f"{name}은 객체여야 합니다")
    return value


def _list(value: object, name: str) -> Sequence[object]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise EvaluationError(f"{name}은 배열이어야 합니다")
    return value


def _keys(value: Mapping[str, object], expected: set[str], name: str) -> None:
    actual = set(value)
    if actual != expected:
        missing = sorted(expected - actual)
        unknown = sorted(actual - expected)
        raise EvaluationError(f"{name} 키가 올바르지 않습니다: missing={missing}, unknown={unknown}")


def _version(value: object) -> None:
    if value != CONTRACT_VERSION:
        raise EvaluationError(f"contract_version은 {CONTRACT_VERSION}이어야 합니다")


def _string(value: object, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise EvaluationError(f"{name}은 비어 있지 않은 문자열이어야 합니다")
    return value


def _enum(value: object, allowed: tuple[str, ...], name: str) -> str:
    result = _string(value, name)
    if result not in allowed:
        raise EvaluationError(f"알 수 없는 {name}입니다: {result}")
    return result


def _optional_enum(
    value: object, allowed: tuple[str, ...], name: str
) -> str | None:
    return None if value is None else _enum(value, allowed, name)


def _non_negative_int(value: object, name: str) -> int:
    if type(value) is not int or value < 0:
        raise EvaluationError(f"{name}은 0 이상의 정수여야 합니다")
    return value


def _positive_int(value: object, name: str) -> int:
    result = _non_negative_int(value, name)
    if result == 0:
        raise EvaluationError(f"{name}은 양수여야 합니다")
    return result


def _boolean(value: object, name: str) -> bool:
    if type(value) is not bool:
        raise EvaluationError(f"{name}은 boolean이어야 합니다")
    return value


def _unique(values: Sequence[object] | tuple[object, ...], name: str) -> None:
    collected = tuple(values)
    if len(collected) != len(set(collected)):
        raise EvaluationError(f"중복된 {name}이 있습니다")
