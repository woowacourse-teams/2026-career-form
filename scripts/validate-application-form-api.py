#!/usr/bin/env python3
import argparse
import json
import re
import sys
from collections import Counter
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import yaml


FORBIDDEN_PROPERTIES = {
    "value",
    "controlvalue",
    "inputvalue",
    "profile",
    "profilevalue",
    "profileitemcount",
    "localitemcount",
    "desiredcount",
    "desiredgroupcount",
    "html",
    "innerhtml",
    "outerhtml",
    "url",
    "fullurl",
    "checked",
    "selected",
    "cookie",
    "cookies",
    "session",
    "sessionid",
    "account",
    "accountid",
    "authorization",
    "selector",
    "cssselector",
    "xpath",
    "script",
    "executablecode",
    "href",
    "query",
    "fragment",
    "domhandle",
}
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
    requests: dict[tuple[str, str], Mapping[str, Any]] = {}
    llm_inputs: dict[str, Mapping[str, Any]] = {}
    action_inputs: dict[str, Mapping[str, Any]] = {}
    try:
        examples = _examples(reference_path)
    except (OSError, ValueError) as error:
        return [str(error)]
    for kind, example in examples:
        if kind.endswith("-request") and isinstance(example, Mapping):
            snapshot_id = example.get("snapshotId")
            if isinstance(snapshot_id, str):
                requests[(kind, snapshot_id)] = example
        if kind == "llm-mapping-input" and isinstance(example, Mapping):
            snapshot_id = example.get("snapshotId")
            if isinstance(snapshot_id, str):
                llm_inputs[snapshot_id] = example
        if kind == "llm-action-input" and isinstance(example, Mapping):
            snapshot_id = example.get("snapshotId")
            if isinstance(snapshot_id, str):
                action_inputs[snapshot_id] = example
    for index, (kind, example) in enumerate(examples, start=1):
        prefix = f"example {index} ({kind})"
        try:
            schema = _example_schema(document, kind)
            errors.extend(_validate_schema(example, schema, document, prefix))
        except (KeyError, ValueError) as error:
            errors.append(f"{prefix}: $ref를 해석할 수 없습니다: {error}")
        errors.extend(_forbidden_property_errors(example, prefix))
        if kind.endswith("-request") and isinstance(example, Mapping):
            errors.extend(_request_relationship_errors(example, prefix))
        if kind.endswith("-response") and isinstance(example, Mapping):
            errors.extend(_response_relationship_errors(kind, example, requests, prefix))
        if kind == "llm-mapping-input" and isinstance(example, Mapping):
            errors.extend(_request_relationship_errors(example, prefix))
            fields_request = requests.get(("fields-request", example.get("snapshotId")))
            if fields_request is None:
                errors.append(
                    f"{prefix}: 같은 snapshotId의 fields request 예시가 없습니다"
                )
            else:
                errors.extend(
                    _llm_input_relationship_errors(fields_request, example, prefix)
                )
        if kind == "llm-mapping-output" and isinstance(example, Mapping):
            llm_input = llm_inputs.get(example.get("snapshotId"))
            if llm_input is None:
                errors.append(f"{prefix}: 같은 snapshotId의 LLM input 예시가 없습니다")
            else:
                errors.extend(_llm_relationship_errors(llm_input, example, prefix))
        if kind == "llm-action-input" and isinstance(example, Mapping):
            errors.extend(_request_relationship_errors(example, prefix))
            preparation_request = requests.get(
                ("preparation-request", example.get("snapshotId"))
            )
            if preparation_request is None:
                errors.append(
                    f"{prefix}: 같은 snapshotId의 preparation request 예시가 없습니다"
                )
            else:
                errors.extend(
                    _llm_action_input_relationship_errors(
                        preparation_request,
                        example,
                        prefix,
                    )
                )
        if kind == "llm-action-output" and isinstance(example, Mapping):
            llm_input = action_inputs.get(example.get("snapshotId"))
            if llm_input is None:
                errors.append(
                    f"{prefix}: 같은 snapshotId의 action LLM input 예시가 없습니다"
                )
            else:
                errors.extend(
                    _llm_action_output_relationship_errors(
                        llm_input,
                        example,
                        prefix,
                    )
                )
    return errors


def _openapi_structure_errors(document: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    paths = document.get("paths")
    expected_paths = {"/api/v1/preparation/analyze", "/api/v1/fields/analyze"}
    if not isinstance(paths, Mapping) or set(paths) != expected_paths:
        errors.append("외부 API path는 preparation 및 fields POST 두 개여야 합니다")
    elif any(set(paths[path]) != {"post"} for path in expected_paths):
        errors.append("외부 API method는 각 path마다 POST 하나여야 합니다")

    def visit(value: Any, path: str) -> None:
        if isinstance(value, Mapping):
            if "$ref" in value:
                try:
                    _resolve(value, document)
                except (KeyError, ValueError) as error:
                    errors.append(f"{path}: $ref를 해석할 수 없습니다: {error}")
            if value.get("type") == "object" and value.get("additionalProperties") is not False:
                errors.append(f"{path}: object는 additionalProperties: false가 필요합니다")
            properties = value.get("properties")
            if value.get("type") == "object" and isinstance(properties, Mapping):
                errors.extend(
                    f"{path}: forbidden schema property: {name}"
                    for name in properties
                    if name.lower() in FORBIDDEN_PROPERTIES
                )
            for name, child in value.items():
                visit(child, f"{path}.{name}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{path}[{index}]")

    visit(document, "openapi")
    if document.get("info", {}).get("version") == "3.0.0":
        errors.extend(_current_contract_errors(document))
    return errors


def _current_contract_errors(document: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    limits = document.get("x-snapshot-byte-limits")
    if limits != {"raw": 65_536, "canonical": 65_536}:
        errors.append("raw/canonical snapshot byte 상한은 각각 65,536이어야 합니다")

    expected_statuses = {"200", "400", "413", "500"}
    expected_codes = {
        "400": "INVALID_REQUEST",
        "413": "SNAPSHOT_TOO_LARGE",
        "500": "INTERNAL_ERROR",
    }
    paths = document.get("paths", {})
    if not isinstance(paths, Mapping):
        return errors
    for path, path_item in paths.items():
        if not isinstance(path_item, Mapping):
            continue
        operation = path_item.get("post")
        if not isinstance(operation, Mapping):
            continue
        responses = operation.get("responses")
        if not isinstance(responses, Mapping):
            errors.append(f"{path}: responses가 없습니다")
            continue
        if set(responses) != expected_statuses:
            errors.append(
                f"{path}: response status는 200/400/413/500만 허용합니다"
            )
        for status, expected_code in expected_codes.items():
            response_schema = responses.get(status)
            if not isinstance(response_schema, Mapping):
                continue
            try:
                response = _resolve(response_schema, document)
                schema = _resolve(
                    response["content"]["application/json"]["schema"],
                    document,
                )
                code_schema = schema["properties"]["code"]
                if code_schema.get("const") != expected_code:
                    errors.append(
                        f"{path} {status}: error code는 {expected_code}여야 합니다"
                    )
            except (KeyError, TypeError, ValueError):
                errors.append(f"{path} {status}: error response schema를 확인할 수 없습니다")
    return errors


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


def _validate_schema(value: Any, schema: Mapping[str, Any], document: Mapping[str, Any], path: str) -> list[str]:
    schema = _resolve(schema, document)
    errors: list[str] = []
    if "allOf" in schema:
        for child in schema["allOf"]:
            errors.extend(_validate_schema(value, child, document, path))
    if "oneOf" in schema:
        matches = [
            _validate_schema(value, child, document, path)
            for child in schema["oneOf"]
        ]
        if sum(not result for result in matches) != 1:
            errors.append(f"{path}: oneOf 조건을 만족하지 않습니다")
        return errors
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: const가 일치하지 않습니다")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: enum에 없는 값입니다")
    expected_type = schema.get("type")
    if expected_type and not _has_type(value, expected_type):
        return [f"{path}: {expected_type} 타입이 아닙니다"]
    if expected_type == "string":
        minimum_length = schema.get("minLength")
        if isinstance(minimum_length, int) and len(value) < minimum_length:
            errors.append(f"{path}: minLength를 만족하지 않습니다")
        maximum_length = schema.get("maxLength")
        if isinstance(maximum_length, int) and len(value) > maximum_length:
            errors.append(f"{path}: maxLength를 만족하지 않습니다")
        pattern = schema.get("pattern")
        if isinstance(pattern, str) and re.fullmatch(pattern, value) is None:
            errors.append(f"{path}: pattern을 만족하지 않습니다")
    if expected_type == "object":
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        for name in required:
            if name not in value:
                errors.append(f"{path}: required property가 없습니다: {name}")
        for name, child in value.items():
            if name not in properties:
                if schema.get("additionalProperties") is False:
                    errors.append(f"{path}: unknown property: {name}")
                continue
            errors.extend(_validate_schema(child, properties[name], document, f"{path}.{name}"))
    if expected_type == "array":
        minimum_items = schema.get("minItems")
        if isinstance(minimum_items, int) and len(value) < minimum_items:
            errors.append(f"{path}: minItems를 만족하지 않습니다")
        maximum_items = schema.get("maxItems")
        if isinstance(maximum_items, int) and len(value) > maximum_items:
            errors.append(f"{path}: maxItems를 만족하지 않습니다")
        for index, child in enumerate(value):
            errors.extend(_validate_schema(child, schema.get("items", {}), document, f"{path}[{index}]"))
    return errors


def _resolve(schema: Mapping[str, Any], document: Mapping[str, Any]) -> Mapping[str, Any]:
    reference = schema.get("$ref")
    if not isinstance(reference, str):
        return schema
    if not reference.startswith("#/"):
        raise ValueError(f"외부 $ref는 허용하지 않습니다: {reference}")
    target: Any = document
    for part in reference[2:].split("/"):
        target = target[part.replace("~1", "/").replace("~0", "~")]
    if not isinstance(target, Mapping):
        raise ValueError(f"$ref 대상이 schema 객체가 아닙니다: {reference}")
    return target


def _has_type(value: Any, expected: str) -> bool:
    return {
        "object": isinstance(value, Mapping),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
    }.get(expected, True)


def _forbidden_property_errors(value: Any, path: str) -> list[str]:
    if isinstance(value, Mapping):
        errors = [
            f"{path}: forbidden property: {name}"
            for name in value
            if name.lower() in FORBIDDEN_PROPERTIES
        ]
        return errors + [
            error for name, child in value.items() for error in _forbidden_property_errors(child, f"{path}.{name}")
        ]
    if isinstance(value, list):
        return [
            error for index, child in enumerate(value) for error in _forbidden_property_errors(child, f"{path}[{index}]")
        ]
    return []


def _request_relationship_errors(request: Mapping[str, Any], path: str) -> list[str]:
    sections = request.get("sections", [])
    if not isinstance(sections, list):
        return []
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
            if section_id in seen_section_ids:
                errors.append(f"{path}: duplicate sectionId: {section_id}")
            seen_section_ids.add(section_id)
        if isinstance(section_id, str) and isinstance(parent, str):
            if parent not in section_ids:
                errors.append(f"{path}: parentSectionId가 존재하지 않습니다: {parent}")
            parents[section_id] = parent
        for item in section.get("items", []):
            if not isinstance(item, Mapping) or not isinstance(item.get("itemId"), str):
                continue
            item_id = item["itemId"]
            if item_id in item_ids:
                errors.append(f"{path}: duplicate itemId: {item_id}")
            item_ids.add(item_id)
        for collection in ("fields", "actionCandidates"):
            for candidate in _section_candidates(section, collection):
                if isinstance(candidate, Mapping) and isinstance(candidate.get("candidateId"), str):
                    candidate_id = candidate["candidateId"]
                    if candidate_id in candidate_ids:
                        errors.append(f"{path}: duplicate candidateId: {candidate_id}")
                    candidate_ids.add(candidate_id)
                    option_ids: set[str] = set()
                    for option in candidate.get("options", []):
                        if not isinstance(option, Mapping):
                            continue
                        option_id = option.get("optionId")
                        if not isinstance(option_id, str):
                            continue
                        if option_id in option_ids:
                            errors.append(
                                f"{path}: duplicate optionId: {option_id}"
                            )
                        option_ids.add(option_id)
    for section_id in parents:
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
    field_ids, action_ids = _request_candidate_ids(request)
    if kind == "fields-response":
        errors.extend(_fields_response_route_errors(response, path))
        actual_field_ids = [
            field.get("candidateId")
            for field in response.get("fields", [])
            if isinstance(field, Mapping)
        ]
        if response.get("analysisStatus") == "COMPLETE":
            errors.extend(
                _exact_candidate_set_errors(
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
        for candidate in _section_candidates(section, "fields"):
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


def _llm_relationship_errors(
    llm_input: Mapping[str, Any],
    llm_output: Mapping[str, Any],
    path: str,
) -> list[str]:
    input_ids = _nested_candidate_ids(llm_input, "fields")
    output_ids = [
        result.get("candidateId")
        for result in llm_output.get("results", [])
        if isinstance(result, Mapping)
    ]
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
    results = [
        result
        for result in llm_output.get("results", [])
        if isinstance(result, Mapping)
    ]
    actual = [result.get("candidateId") for result in results]
    errors = _llm_header_errors(llm_input, llm_output, path)
    errors.extend(_exact_candidate_set_errors(expected, actual, path))
    errors.extend(_action_result_errors(llm_input, results, path))
    return errors


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
    for section in llm_input.get("sections", []):
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
    for section in payload.get("sections", []):
        if not isinstance(section, Mapping):
            continue
        candidate_ids.extend(
            candidate["candidateId"]
            for candidate in _section_candidates(section, collection_name)
            if isinstance(candidate, Mapping)
            and isinstance(candidate.get("candidateId"), str)
        )
    return candidate_ids


def _nested_field_candidate_ids(payload: Mapping[str, Any]) -> list[str]:
    return _nested_candidate_ids(payload, "fields")


def _request_candidate_ids(request: Mapping[str, Any]) -> tuple[set[str], set[str]]:
    fields: set[str] = set()
    actions: set[str] = set()
    for section in request.get("sections", []):
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
    candidates = list(section.get(collection, []))
    for item in section.get("items", []):
        if isinstance(item, Mapping):
            candidates.extend(item.get(collection, []))
    return candidates


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
