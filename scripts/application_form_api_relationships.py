from collections import Counter
from collections.abc import Mapping
from typing import Any


def _llm_relationship_errors(
    llm_input: Mapping[str, Any],
    llm_output: Mapping[str, Any],
    path: str,
) -> list[str]:
    input_ids = _nested_candidate_ids(llm_input, "fields")
    output_ids = _field_output_candidate_ids(llm_output)
    errors = _llm_header_errors(llm_input, llm_output, path)
    errors.extend(_exact_candidate_set_errors(input_ids, output_ids, path))
    return errors


def _llm_input_relationship_errors(
    fields_request: Mapping[str, Any],
    llm_input: Mapping[str, Any],
    path: str,
) -> list[str]:
    request_ids = _nested_candidate_ids(fields_request, "fields")
    input_ids = _nested_candidate_ids(llm_input, "fields")
    errors = _llm_header_errors(fields_request, llm_input, path)
    errors.extend(_exact_candidate_set_errors(request_ids, input_ids, path))
    return errors


def _llm_action_input_relationship_errors(
    request: Mapping[str, Any],
    llm_input: Mapping[str, Any],
    path: str,
) -> list[str]:
    errors = _llm_header_errors(request, llm_input, path)
    errors.extend(
        _exact_candidate_set_errors(
            _nested_candidate_ids(request, "actionCandidates"),
            _nested_candidate_ids(llm_input, "actionCandidates"),
            path,
        )
    )
    return errors


def _llm_action_output_relationship_errors(
    llm_input: Mapping[str, Any],
    llm_output: Mapping[str, Any],
    path: str,
) -> list[str]:
    expected = _nested_candidate_ids(llm_input, "actionCandidates")
    errors = _llm_header_errors(llm_input, llm_output, path)
    if "results" in llm_output:
        results = [
            result
            for result in llm_output.get("results", [])
            if isinstance(result, Mapping)
        ]
        actual = [result.get("candidateId") for result in results]
        errors.extend(_exact_candidate_set_errors(expected, actual, path))
        errors.extend(_action_result_errors(llm_input, results, path))
        return errors

    reveal_sections = _bucket_entries(llm_output, "revealSections")
    add_repeatable_groups = _bucket_entries(llm_output, "addRepeatableGroups")
    no_actions = _bucket_entries(llm_output, "noActions")
    actual = [
        entry.get("candidateId")
        for entry in reveal_sections + add_repeatable_groups + no_actions
    ]
    errors.extend(_exact_candidate_set_errors(expected, actual, path))
    errors.extend(
        _action_bucket_errors(
            llm_input,
            reveal_sections,
            add_repeatable_groups,
            path,
        )
    )
    return errors


def _field_output_candidate_ids(llm_output: Mapping[str, Any]) -> list[Any]:
    if "results" in llm_output:
        return [
            result.get("candidateId")
            for result in llm_output.get("results", [])
            if isinstance(result, Mapping)
        ]
    return [
        entry.get("candidateId")
        for entry in (
            _bucket_entries(llm_output, "matches")
            + _bucket_entries(llm_output, "noMatches")
        )
    ]


def _bucket_entries(
    payload: Mapping[str, Any],
    bucket_name: str,
) -> list[Mapping[str, Any]]:
    bucket = payload.get(bucket_name, [])
    if not isinstance(bucket, list):
        return []
    return [entry for entry in bucket if isinstance(entry, Mapping)]


def _exact_candidate_set_errors(
    expected: list[Any],
    actual: list[Any],
    prefix: str,
) -> list[str]:
    expected_ids = [value for value in expected if isinstance(value, str)]
    actual_ids = [value for value in actual if isinstance(value, str)]
    expected_counts = Counter(expected_ids)
    actual_counts = Counter(actual_ids)
    errors = [
        f"{prefix}: duplicate candidateId: {candidate_id}"
        for candidate_id, count in actual_counts.items()
        if count > 1
    ]
    missing = sorted(expected_counts.keys() - actual_counts.keys())
    unknown = sorted(actual_counts.keys() - expected_counts.keys())
    if missing:
        errors.append(f"{prefix}: missing candidateId: {', '.join(missing)}")
    if unknown:
        errors.append(f"{prefix}: unknown candidateId: {', '.join(unknown)}")
    return errors


def _llm_header_errors(
    source: Mapping[str, Any],
    result: Mapping[str, Any],
    path: str,
) -> list[str]:
    errors: list[str] = []
    if source.get("schemaVersion") != result.get("schemaVersion"):
        errors.append(f"{path}: schemaVersion이 일치하지 않습니다")
    if source.get("snapshotId") != result.get("snapshotId"):
        errors.append(f"{path}: snapshotId가 일치하지 않습니다")
    return errors


def _action_result_errors(
    llm_input: Mapping[str, Any],
    results: list[Mapping[str, Any]],
    path: str,
) -> list[str]:
    candidates: dict[str, Mapping[str, Any]] = {}
    section_ids: set[str] = set()
    for section in llm_input.get("sections", []) or []:
        if not isinstance(section, Mapping):
            continue
        section_id = section.get("sectionId")
        if isinstance(section_id, str):
            section_ids.add(section_id)
        for candidate in _section_candidates(section, "actionCandidates"):
            if isinstance(candidate, Mapping) and isinstance(
                candidate.get("candidateId"), str
            ):
                candidates[candidate["candidateId"]] = candidate

    errors: list[str] = []
    for result in results:
        if result.get("actionType") != "ACTION":
            continue
        candidate_id = result.get("candidateId")
        candidate = candidates.get(candidate_id)
        if candidate is None:
            continue
        if (
            candidate.get("visibility") != "visible"
            or candidate.get("disabled") is True
            or candidate.get("readonly") is True
            or candidate.get("inert") is True
        ):
            errors.append(
                f"{path}: ACTION은 실행 불가 candidate를 사용할 수 없습니다: "
                f"{candidate_id}"
            )
        command = result.get("command")
        effect = result.get("expectedEffect")
        if command == "REVEAL_SECTION":
            if effect != "TARGET_VISIBLE":
                errors.append(f"{path}: REVEAL_SECTION tuple이 올바르지 않습니다")
            target = result.get("targetSectionId")
            if target not in section_ids:
                errors.append(f"{path}: targetSectionId가 LLM input에 없습니다")
        elif command == "ADD_REPEATABLE_GROUP":
            if effect != "GROUP_COUNT_INCREMENT":
                errors.append(
                    f"{path}: ADD_REPEATABLE_GROUP tuple이 올바르지 않습니다"
                )
        else:
            errors.append(f"{path}: 지원하지 않는 ACTION command입니다")
    return errors


def _action_bucket_errors(
    llm_input: Mapping[str, Any],
    reveal_sections: list[Mapping[str, Any]],
    add_repeatable_groups: list[Mapping[str, Any]],
    path: str,
) -> list[str]:
    candidates: dict[str, Mapping[str, Any]] = {}
    section_ids: set[str] = set()
    for section in llm_input.get("sections", []) or []:
        if not isinstance(section, Mapping):
            continue
        section_id = section.get("sectionId")
        if isinstance(section_id, str):
            section_ids.add(section_id)
        for candidate in _section_candidates(section, "actionCandidates"):
            if isinstance(candidate, Mapping) and isinstance(
                candidate.get("candidateId"), str
            ):
                candidates[candidate["candidateId"]] = candidate

    errors: list[str] = []
    for action in reveal_sections + add_repeatable_groups:
        candidate_id = action.get("candidateId")
        candidate = candidates.get(candidate_id)
        if candidate is None:
            continue
        if (
            candidate.get("visibility") != "visible"
            or candidate.get("disabled") is True
            or candidate.get("readonly") is True
            or candidate.get("inert") is True
        ):
            errors.append(
                f"{path}: ACTION은 실행 불가 candidate를 사용할 수 없습니다: "
                f"{candidate_id}"
            )
    for action in reveal_sections:
        if action.get("targetSectionId") not in section_ids:
            errors.append(f"{path}: targetSectionId가 LLM input에 없습니다")
    return errors


def _partial_response_errors(
    kind: str,
    response: Mapping[str, Any],
    prefix: str,
) -> list[str]:
    if response.get("analysisStatus") != "PARTIAL":
        return []
    result_name = (
        "preparationPlans" if kind == "preparation-response" else "fields"
    )
    errors: list[str] = []
    if response.get("warningCodes") != ["LLM_UNAVAILABLE"]:
        errors.append(f"{prefix}: PARTIAL warningCodes가 올바르지 않습니다")
    if response.get(result_name) != []:
        errors.append(f"{prefix}: PARTIAL 결과는 비어 있어야 합니다")
    return errors


def _nested_candidate_ids(
    payload: Mapping[str, Any], collection_name: str
) -> list[str]:
    candidate_ids: list[str] = []
    for section in payload.get("sections", []) or []:
        if not isinstance(section, Mapping):
            continue
        candidate_ids.extend(
            candidate["candidateId"]
            for candidate in _section_candidates(section, collection_name)
            if isinstance(candidate, Mapping)
            and isinstance(candidate.get("candidateId"), str)
        )
    return candidate_ids


def _request_candidate_ids(request: Mapping[str, Any]) -> tuple[set[str], set[str]]:
    fields: set[str] = set()
    actions: set[str] = set()
    for section in request.get("sections", []) or []:
        if not isinstance(section, Mapping):
            continue
        fields.update(
            candidate["candidateId"]
            for candidate in _section_candidates(section, "fields")
            if isinstance(candidate, Mapping) and isinstance(candidate.get("candidateId"), str)
        )
        actions.update(
            candidate["candidateId"]
            for candidate in _section_candidates(section, "actionCandidates")
            if isinstance(candidate, Mapping) and isinstance(candidate.get("candidateId"), str)
        )
    return fields, actions


def _section_candidates(section: Mapping[str, Any], collection: str) -> list[Any]:
    candidates = list(section.get(collection, []) or [])
    for item in section.get("items", []) or []:
        if isinstance(item, Mapping):
            candidates.extend(item.get(collection, []) or [])
    return candidates
