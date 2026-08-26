#!/usr/bin/env python3
import argparse
import json
import re
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import yaml

try:
    import application_form_api_relationships as _relationships
    import application_form_api_schema as _schema
except ModuleNotFoundError:
    from scripts import application_form_api_relationships as _relationships
    from scripts import application_form_api_schema as _schema

_llm_relationship_errors = _relationships._llm_relationship_errors
_llm_input_relationship_errors = _relationships._llm_input_relationship_errors
_llm_action_output_relationship_errors = _relationships._llm_action_output_relationship_errors
_partial_response_errors = _relationships._partial_response_errors
_openapi_structure_errors = _schema._openapi_structure_errors
_current_contract_errors = _schema._current_contract_errors
_validate_schema = _schema._validate_schema
_resolve = _schema._resolve
_has_type = _schema._has_type
_forbidden_property_errors = _schema._forbidden_property_errors
FORBIDDEN_PROPERTIES = _schema.FORBIDDEN_PROPERTIES
EXAMPLE_PATTERN = re.compile(
    r"<!-- (?:api-example: (preparation-request|preparation-response|fields-request|fields-response)|llm-example: (mapping-input|mapping-output|action-input|action-output)) -->\s*```json\s*(.*?)```",
    re.DOTALL,
)
EXAMPLE_OPERATIONS = {
    "preparation-request": ("/api/v1/preparation/analyze", "request"),
    "preparation-response": ("/api/v1/preparation/analyze", "response"),
    "fields-request": ("/api/v1/fields/analyze", "request"),
    "fields-response": ("/api/v1/fields/analyze", "response"),
}


def validate_contract(openapi_path: Path, reference_path: Path) -> list[str]:
    try:
        document = yaml.safe_load(openapi_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        return [f"OpenAPI YAML을 읽을 수 없습니다: {error}"]
    if not isinstance(document, Mapping):
        return ["OpenAPI 최상위 객체가 아닙니다"]

    schemas = document.get("components", {}).get("schemas", {})
    if not isinstance(schemas, Mapping):
        return ["OpenAPI components.schemas가 없습니다"]
    errors = _openapi_structure_errors(document)
    try:
        examples = _examples(reference_path)
    except (OSError, ValueError) as error:
        return [str(error)]

    current_contract = document.get("info", {}).get("version") == "3.0.0"
    requests, llm_inputs, action_inputs = _index_examples(examples)
    for index, (kind, example) in enumerate(examples, start=1):
        errors.extend(
            _example_errors(
                document,
                kind,
                example,
                f"example {index} ({kind})",
                current_contract,
                requests,
                llm_inputs,
                action_inputs,
            )
        )
    return errors


def _index_examples(
    examples: list[tuple[str, Any]],
) -> tuple[
    dict[tuple[str, str], Mapping[str, Any]],
    dict[str, Mapping[str, Any]],
    dict[str, Mapping[str, Any]],
]:
    requests: dict[tuple[str, str], Mapping[str, Any]] = {}
    llm_inputs: dict[str, Mapping[str, Any]] = {}
    action_inputs: dict[str, Mapping[str, Any]] = {}
    for kind, example in examples:
        if not isinstance(example, Mapping):
            continue
        snapshot_id = example.get("snapshotId")
        if not isinstance(snapshot_id, str):
            continue
        if kind.endswith("-request"):
            requests[(kind, snapshot_id)] = example
        elif kind == "llm-mapping-input":
            llm_inputs[snapshot_id] = example
        elif kind == "llm-action-input":
            action_inputs[snapshot_id] = example
    return requests, llm_inputs, action_inputs


def _example_errors(
    document: Mapping[str, Any],
    kind: str,
    example: Any,
    path: str,
    current_contract: bool,
    requests: Mapping[tuple[str, str], Mapping[str, Any]],
    llm_inputs: Mapping[str, Mapping[str, Any]],
    action_inputs: Mapping[str, Mapping[str, Any]],
) -> list[str]:
    errors: list[str] = []
    try:
        schema = _example_schema(document, kind)
        errors.extend(_validate_schema(example, schema, document, path))
    except (KeyError, ValueError) as error:
        errors.append(f"{path}: $ref를 해석할 수 없습니다: {error}")
    errors.extend(_forbidden_property_errors(example, path))
    if not isinstance(example, Mapping):
        return errors

    errors.extend(
        _api_example_relationship_errors(
            kind,
            example,
            path,
            current_contract,
            requests,
        )
    )
    errors.extend(
        _llm_example_relationship_errors(
            kind,
            example,
            path,
            current_contract,
            requests,
            llm_inputs,
            action_inputs,
        )
    )
    return errors


def _api_example_relationship_errors(
    kind: str,
    example: Mapping[str, Any],
    path: str,
    current_contract: bool,
    requests: Mapping[tuple[str, str], Mapping[str, Any]],
) -> list[str]:
    if kind.endswith("-request"):
        return _request_relationship_errors(
            example,
            path,
            legacy=not current_contract,
            enforce_unique_sections=kind == "preparation-request",
        )
    if kind.endswith("-response"):
        return _response_relationship_errors(kind, example, requests, path)
    return []


def _llm_example_relationship_errors(
    kind: str,
    example: Mapping[str, Any],
    path: str,
    current_contract: bool,
    requests: Mapping[tuple[str, str], Mapping[str, Any]],
    llm_inputs: Mapping[str, Mapping[str, Any]],
    action_inputs: Mapping[str, Mapping[str, Any]],
) -> list[str]:
    if kind == "llm-mapping-input":
        return _mapping_input_errors(example, path, current_contract, requests)
    if kind == "llm-mapping-output":
        return _mapping_output_errors(example, path, llm_inputs)
    if kind == "llm-action-input":
        return _action_input_errors(example, path, current_contract, requests)
    if kind == "llm-action-output":
        return _action_output_errors(example, path, action_inputs)
    return []


def _mapping_input_errors(
    example: Mapping[str, Any],
    path: str,
    current_contract: bool,
    requests: Mapping[tuple[str, str], Mapping[str, Any]],
) -> list[str]:
    errors = _request_relationship_errors(
        example,
        path,
        legacy=not current_contract,
        enforce_unique_sections=False,
    )
    fields_request = requests.get(("fields-request", example.get("snapshotId")))
    if fields_request is None:
        errors.append(f"{path}: 같은 snapshotId의 fields request 예시가 없습니다")
    else:
        errors.extend(_llm_input_relationship_errors(fields_request, example, path))
    return errors


def _mapping_output_errors(
    example: Mapping[str, Any],
    path: str,
    llm_inputs: Mapping[str, Mapping[str, Any]],
) -> list[str]:
    llm_input = llm_inputs.get(example.get("snapshotId"))
    if llm_input is None:
        return [f"{path}: 같은 snapshotId의 LLM input 예시가 없습니다"]
    return _llm_relationship_errors(llm_input, example, path)


def _action_input_errors(
    example: Mapping[str, Any],
    path: str,
    current_contract: bool,
    requests: Mapping[tuple[str, str], Mapping[str, Any]],
) -> list[str]:
    errors = _request_relationship_errors(
        example,
        path,
        legacy=not current_contract,
        enforce_unique_sections=True,
    )
    request = requests.get(("preparation-request", example.get("snapshotId")))
    if request is None:
        errors.append(f"{path}: 같은 snapshotId의 preparation request 예시가 없습니다")
    else:
        errors.extend(
            _relationships._llm_action_input_relationship_errors(
                request,
                example,
                path,
            )
        )
    return errors


def _action_output_errors(
    example: Mapping[str, Any],
    path: str,
    action_inputs: Mapping[str, Mapping[str, Any]],
) -> list[str]:
    llm_input = action_inputs.get(example.get("snapshotId"))
    if llm_input is None:
        return [f"{path}: 같은 snapshotId의 action LLM input 예시가 없습니다"]
    return _llm_action_output_relationship_errors(llm_input, example, path)


def _example_schema(document: Mapping[str, Any], kind: str) -> Mapping[str, Any]:
    if kind == "llm-action-input":
        return document["components"]["schemas"]["LlmActionInput"]
    if kind == "llm-action-output":
        return document["components"]["schemas"]["LlmActionOutput"]
    if kind == "llm-mapping-input":
        return document["components"]["schemas"]["LlmMappingInput"]
    if kind == "llm-mapping-output":
        return document["components"]["schemas"]["LlmMappingOutput"]
    path, direction = EXAMPLE_OPERATIONS[kind]
    operation = document["paths"][path]["post"]
    if direction == "request":
        return operation["requestBody"]["content"]["application/json"]["schema"]
    return operation["responses"]["200"]["content"]["application/json"]["schema"]


def _examples(reference_path: Path) -> list[tuple[str, Any]]:
    content = reference_path.read_text(encoding="utf-8")
    examples: list[tuple[str, Any]] = []
    for api_kind, llm_kind, body in EXAMPLE_PATTERN.findall(content):
        kind = api_kind or f"llm-{llm_kind}"
        try:
            examples.append((kind, json.loads(body)))
        except json.JSONDecodeError as error:
            raise ValueError(f"{kind} JSON 예시를 읽을 수 없습니다: {error}") from error
    if not examples:
        raise ValueError("api-example 표식이 있는 JSON 예시가 없습니다")
    return examples


def profile_field_contract_errors(
    document: Mapping[str, Any],
    field_definitions_path: Path,
    profile_fields_path: Path,
) -> list[str]:
    try:
        expected, discovery_errors = _expected_profile_field_policies(
            field_definitions_path.read_text(encoding="utf-8"),
            profile_fields_path.read_text(encoding="utf-8"),
        )
    except OSError as error:
        return [f"프로필 필드 기준을 읽을 수 없습니다: {error}"]
    errors = list(discovery_errors)
    schema = document.get("components", {}).get("schemas", {}).get(
        "ProfileFieldKey"
    )
    if not isinstance(schema, Mapping):
        return errors + ["ProfileFieldKey schema가 없습니다"]
    enum = schema.get("enum")
    policies = schema.get("x-autofill-policies")
    if not isinstance(enum, list) or not all(isinstance(key, str) for key in enum):
        return errors + ["ProfileFieldKey enum이 문자열 배열이 아닙니다"]
    if not isinstance(policies, Mapping):
        return errors + ["ProfileFieldKey x-autofill-policies가 없습니다"]

    actual_keys = set(enum)
    expected_keys = set(expected)
    missing = sorted(expected_keys - actual_keys)
    extra = sorted(actual_keys - expected_keys)
    if missing:
        errors.append(f"ProfileFieldKey 누락: {', '.join(missing)}")
    if extra:
        errors.append(f"ProfileFieldKey 허용되지 않은 key: {', '.join(extra)}")
    if set(policies) != actual_keys:
        errors.append("ProfileFieldKey enum과 x-autofill-policies key가 일치하지 않습니다")
    mismatches = sorted(
        key
        for key in expected_keys & set(policies)
        if policies[key] != expected[key]
    )
    if mismatches:
        errors.append(f"ProfileFieldKey policy 불일치: {', '.join(mismatches)}")
    return errors


def _expected_profile_field_policies(
    definitions: str, profile_fields: str
) -> tuple[dict[str, str], list[str]]:
    policy_names = {
        "허용": "ALLOWED",
        "조건부": "CONDITIONAL",
        "민감 확인": "SENSITIVE_CONFIRMATION",
        "미입력": "NEVER_AUTOFILL",
    }
    policies_by_field: dict[str, str] = {}
    errors: list[str] = []
    row_pattern = re.compile(
        r"^\|\s*`([^`]+)`\s*\|[^|]*\|[^|]*\|\s*(허용|조건부|민감 확인|미입력)\s*\|",
        re.MULTILINE,
    )
    for field_id, policy_name in row_pattern.findall(profile_fields):
        policy = policy_names[policy_name]
        existing = policies_by_field.get(field_id)
        if existing is not None and existing != policy:
            errors.append(f"PROFILE_FIELDS policy가 중복 충돌합니다: {field_id}")
        policies_by_field[field_id] = policy

    expected: dict[str, str] = {}
    try:
        category_blocks = _array_object_blocks(definitions, "PROFILE_CATEGORIES")
        for category in category_blocks:
            category_id = _declared_id(category)
            for section in _array_object_blocks(category, "sections:"):
                section_id = _declared_id(section)
                fields = _array_content(section, "fields:")
                field_ids = re.findall(r'(?:text|date)\("([^"]+)"', fields)
                field_ids.extend(re.findall(r'\{\s*id:\s*"([^"]+)"', fields))
                if not field_ids:
                    raise ValueError(
                        f"profile section에 field 선언이 없습니다: {category_id}.{section_id}"
                    )
                for field_id in field_ids:
                    policy = policies_by_field.get(field_id)
                    if policy is None:
                        errors.append(
                            f"PROFILE_FIELDS 자동 입력 policy가 없습니다: {category_id}.{section_id}.{field_id}"
                        )
                    elif policy != "NEVER_AUTOFILL":
                        expected[f"{category_id}.{section_id}.{field_id}"] = policy
    except ValueError as error:
        errors.append(str(error))
    if not expected:
        errors.append("UI 선언에서 canonical profile field key를 찾지 못했습니다")
    return expected, errors


def _array_object_blocks(source: str, marker: str) -> list[str]:
    content = _array_content(source, marker)
    blocks: list[str] = []
    index = 0
    while index < len(content):
        start = content.find("{", index)
        if start < 0:
            break
        end = _matching_delimiter(content, start, "{", "}")
        blocks.append(content[start : end + 1])
        index = end + 1
    if not blocks:
        raise ValueError(f"배열 object 선언을 찾을 수 없습니다: {marker}")
    return blocks


def _array_content(source: str, marker: str) -> str:
    marker_index = source.find(marker)
    if marker_index < 0:
        raise ValueError(f"배열 marker를 찾을 수 없습니다: {marker}")
    search_start = marker_index + len(marker)
    if marker == "PROFILE_CATEGORIES":
        assignment = source.find("=", search_start)
        if assignment < 0:
            raise ValueError("PROFILE_CATEGORIES 할당을 찾을 수 없습니다")
        search_start = assignment + 1
    start = source.find("[", search_start)
    if start < 0:
        raise ValueError(f"배열 시작을 찾을 수 없습니다: {marker}")
    end = _matching_delimiter(source, start, "[", "]")
    return source[start + 1 : end]


def _matching_delimiter(
    source: str, start: int, opening: str, closing: str
) -> int:
    depth = 0
    quote: str | None = None
    escaped = False
    for index in range(start, len(source)):
        character = source[index]
        if quote is not None:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = None
            continue
        if character in {'"', "'", "`"}:
            quote = character
        elif character == opening:
            depth += 1
        elif character == closing:
            depth -= 1
            if depth == 0:
                return index
    raise ValueError(f"닫히지 않은 delimiter가 있습니다: {opening}")


def _declared_id(block: str) -> str:
    match = re.search(r'^\s*id:\s*"([^"]+)"', block, re.MULTILINE)
    if match is None:
        raise ValueError("profile category 또는 section id를 찾을 수 없습니다")
    return match.group(1)


def _request_relationship_errors(
    request: Mapping[str, Any],
    path: str,
    *,
    legacy: bool = False,
    enforce_unique_sections: bool | None = None,
) -> list[str]:
    sections = request.get("sections", [])
    if not isinstance(sections, list):
        return []
    if enforce_unique_sections is None:
        enforce_unique_sections = any(
            isinstance(section, Mapping) and "actionCandidates" in section
            for section in sections
        )
    section_ids = {
        section.get("sectionId")
        for section in sections
        if isinstance(section, Mapping)
    }
    errors: list[str] = []
    seen_section_ids: set[str] = set()
    candidate_ids: set[str] = set()
    item_ids: set[str] = set()
    parents: dict[str, str] = {}
    for section in sections:
        if not isinstance(section, Mapping):
            continue
        section_id = section.get("sectionId")
        parent = section.get("parentSectionId")
        if isinstance(section_id, str):
            if (
                section_id in seen_section_ids
                and (legacy or enforce_unique_sections)
            ):
                errors.append(f"{path}: duplicate sectionId: {section_id}")
            seen_section_ids.add(section_id)
        if legacy and isinstance(section_id, str) and isinstance(parent, str):
            if parent not in section_ids:
                errors.append(f"{path}: parentSectionId가 존재하지 않습니다: {parent}")
            parents[section_id] = parent
        for item in section.get("items", []) or []:
            if not isinstance(item, Mapping) or not isinstance(item.get("itemId"), str):
                continue
            item_id = item["itemId"]
            if legacy and item_id in item_ids:
                errors.append(f"{path}: duplicate itemId: {item_id}")
            item_ids.add(item_id)
        for collection in ("fields", "actionCandidates"):
            for candidate in _relationships._section_candidates(section, collection):
                if isinstance(candidate, Mapping) and isinstance(candidate.get("candidateId"), str):
                    candidate_id = candidate["candidateId"]
                    if candidate_id in candidate_ids:
                        errors.append(f"{path}: duplicate candidateId: {candidate_id}")
                    candidate_ids.add(candidate_id)
                    option_ids: set[str] = set()
                    for option in candidate.get("options", []) or []:
                        if not isinstance(option, Mapping):
                            continue
                        option_id = option.get("optionId")
                        if not isinstance(option_id, str):
                            continue
                        if legacy and option_id in option_ids:
                            errors.append(
                                f"{path}: duplicate optionId: {option_id}"
                            )
                        option_ids.add(option_id)
    for section_id in parents if legacy else ():
        seen: set[str] = set()
        current = section_id
        while current in parents:
            if current in seen:
                errors.append(f"{path}: parentSectionId 순환이 있습니다: {section_id}")
                break
            seen.add(current)
            current = parents[current]
    return errors


def _response_relationship_errors(
    kind: str,
    response: Mapping[str, Any],
    requests: Mapping[tuple[str, str], Mapping[str, Any]],
    path: str,
) -> list[str]:
    errors = _partial_response_errors(kind, response, path)
    request_kind = kind.replace("-response", "-request")
    request = requests.get((request_kind, response.get("snapshotId")))
    if request is None:
        return [f"{path}: 같은 endpoint와 snapshotId의 일치하는 요청 예시가 없습니다"]
    field_ids, action_ids = _relationships._request_candidate_ids(request)
    if kind == "fields-response":
        errors.extend(_fields_response_route_errors(response, path))
        actual_field_ids = [
            field.get("candidateId")
            for field in response.get("fields", [])
            if isinstance(field, Mapping)
        ]
        if response.get("analysisStatus") == "COMPLETE":
            errors.extend(
                _relationships._exact_candidate_set_errors(
                    list(field_ids),
                    actual_field_ids,
                    f"{path}: COMPLETE fields",
                )
            )
        else:
            for candidate_id in actual_field_ids:
                if candidate_id not in field_ids:
                    errors.append(f"{path}: field candidateId가 요청에 없습니다")
        if response.get("mode") == "GENERIC":
            errors.extend(_field_analysis_errors(request, response, path))
    if kind == "preparation-response":
        section_ids = {
            section["sectionId"]
            for section in request.get("sections", [])
            if isinstance(section, Mapping) and isinstance(section.get("sectionId"), str)
        }
        for plan in response.get("preparationPlans", []):
            if not isinstance(plan, Mapping):
                continue
            if plan.get("actionCandidateId") not in action_ids:
                errors.append(f"{path}: actionCandidateId가 요청에 없습니다")
            target_section_id = plan.get("targetSectionId")
            if isinstance(target_section_id, str) and target_section_id not in section_ids:
                errors.append(f"{path}: targetSectionId가 요청에 없습니다")
    return errors


def _fields_response_route_errors(
    response: Mapping[str, Any], path: str
) -> list[str]:
    mode = response.get("mode")
    status = response.get("analysisStatus")
    block_code = response.get("blockCode")
    fields = [
        field for field in response.get("fields", []) if isinstance(field, Mapping)
    ]
    errors: list[str] = []
    if mode == "GENERIC":
        if status == "BLOCKED" or block_code is not None:
            errors.append(f"{path}: GENERIC route는 adapter block 결과를 반환할 수 없습니다")
        if any(field.get("mappingStatus") != "LLM_SUGGESTED" for field in fields):
            errors.append(f"{path}: GENERIC field는 LLM_SUGGESTED여야 합니다")
    if mode == "ADAPTER":
        if status == "BLOCKED":
            if block_code != "ADAPTER_STRUCTURE_MISMATCH" or fields:
                errors.append(
                    f"{path}: adapter mismatch는 빈 fields와 ADAPTER_STRUCTURE_MISMATCH가 필요합니다"
                )
        elif block_code is not None or any(
            field.get("mappingStatus") != "ADAPTER_VERIFIED" for field in fields
        ):
            errors.append(f"{path}: 정상 ADAPTER field는 ADAPTER_VERIFIED여야 합니다")
    return errors


def _field_analysis_errors(
    request: Mapping[str, Any],
    response: Mapping[str, Any],
    path: str,
) -> list[str]:
    if response.get("analysisStatus") != "COMPLETE":
        return []
    candidates: dict[str, Mapping[str, Any]] = {}
    for section in request.get("sections", []):
        if not isinstance(section, Mapping):
            continue
        for candidate in _relationships._section_candidates(section, "fields"):
            if isinstance(candidate, Mapping) and isinstance(
                candidate.get("candidateId"), str
            ):
                candidates[candidate["candidateId"]] = candidate

    commands = {
        ("input", "text"): "SET_TEXT",
        ("textarea", "textarea"): "SET_TEXT",
        ("select", "select"): "SELECT_OPTION",
        ("input", "radio"): "CHECK_RADIO",
        ("input", "checkbox"): "CHECK_CHECKBOX",
    }
    errors: list[str] = []
    for field in response.get("fields", []):
        if not isinstance(field, Mapping):
            continue
        candidate_id = field.get("candidateId")
        candidate = candidates.get(candidate_id)
        if candidate is None:
            continue
        write_plan = field.get("writePlan")
        actual_command = (
            write_plan.get("command") if isinstance(write_plan, Mapping) else None
        )
        if field.get("matchType") == "NO_MATCH":
            expected_status = "BLOCKED"
            expected_command = None
            if field.get("reasonCodes") != ["NO_MATCH"]:
                errors.append(f"{path}: {candidate_id} NO_MATCH reasonCodes가 다릅니다")
        elif (
            candidate.get("disabled") is True
            or candidate.get("readonly") is True
            or candidate.get("inert") is True
        ):
            expected_status = "BLOCKED"
            expected_command = None
        elif candidate.get("visibility") == "hidden":
            expected_status = "MANUAL_REVEAL_REQUIRED"
            expected_command = None
        else:
            expected_command = commands.get(
                (candidate.get("element"), candidate.get("control"))
            )
            if expected_command is None:
                expected_status = "UNVERIFIED"
            else:
                expected_status = "READY"
        if field.get("interactionStatus") != expected_status:
            errors.append(
                f"{path}: {candidate_id} interactionStatus는 "
                f"{expected_status}여야 합니다"
            )
        if actual_command != expected_command:
            errors.append(
                f"{path}: {candidate_id} write command는 "
                f"{expected_command or '없음'}이어야 합니다"
            )
    return errors


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--openapi",
        type=Path,
        default=(
            root
            / "llm-wiki/raw/issues/CF-40/documents/api/application-form-analysis.openapi.yaml"
        ),
    )
    parser.add_argument(
        "--reference",
        type=Path,
        default=(
            root
            / "llm-wiki/raw/issues/CF-40/documents/api/application-form-analysis-api.md"
        ),
    )
    arguments = parser.parse_args()
    errors = validate_contract(arguments.openapi, arguments.reference)
    try:
        document = yaml.safe_load(arguments.openapi.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        document = None
    if isinstance(document, Mapping):
        errors.extend(
            profile_field_contract_errors(
                document,
                root / "frontend/src/profile/field-definitions.ts",
                root
                / "llm-wiki/raw/issues/CF-41/documents/docs/PROFILE_FIELDS.md",
            )
        )
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("지원서 분석 API 계약 검증을 통과했습니다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
