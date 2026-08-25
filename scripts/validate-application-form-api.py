#!/usr/bin/env python3
import argparse
import json
import re
import sys
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
    r"<!-- (?:api-example: (preparation-request|preparation-response|fields-request|fields-response)|llm-example: (mapping-input|mapping-output)) -->\s*```json\s*(.*?)```",
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
    return errors


def _example_schema(document: Mapping[str, Any], kind: str) -> Mapping[str, Any]:
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
    section_ids = {section.get("sectionId") for section in sections if isinstance(section, Mapping)}
    errors: list[str] = []
    candidate_ids: set[str] = set()
    item_ids: set[str] = set()
    parents: dict[str, str] = {}
    for section in sections:
        if not isinstance(section, Mapping):
            continue
        section_id = section.get("sectionId")
        parent = section.get("parentSectionId")
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
    errors: list[str] = []
    request_kind = kind.replace("-response", "-request")
    request = requests.get((request_kind, response.get("snapshotId")))
    if request is None:
        return [f"{path}: 같은 endpoint와 snapshotId의 일치하는 요청 예시가 없습니다"]
    field_ids, action_ids = _request_candidate_ids(request)
    if kind == "fields-response":
        for field in response.get("fields", []):
            if isinstance(field, Mapping) and field.get("candidateId") not in field_ids:
                errors.append(f"{path}: field candidateId가 요청에 없습니다")
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


def _llm_relationship_errors(
    llm_input: Mapping[str, Any],
    llm_output: Mapping[str, Any],
    path: str,
) -> list[str]:
    input_ids = _nested_field_candidate_ids(llm_input)
    output_ids = [
        result["candidateId"]
        for result in llm_output.get("results", [])
        if isinstance(result, Mapping)
        and isinstance(result.get("candidateId"), str)
    ]
    errors: list[str] = []
    if len(input_ids) != len(set(input_ids)):
        errors.append(f"{path}: LLM input candidateId가 중복됩니다")
    if len(output_ids) != len(set(output_ids)):
        errors.append(f"{path}: LLM output candidateId가 중복됩니다")
    missing = sorted(set(input_ids) - set(output_ids))
    unexpected = sorted(set(output_ids) - set(input_ids))
    if missing:
        errors.append(f"{path}: LLM output candidateId가 누락됐습니다: {', '.join(missing)}")
    if unexpected:
        errors.append(
            f"{path}: LLM input에 없는 candidateId입니다: {', '.join(unexpected)}"
        )
    return errors


def _llm_input_relationship_errors(
    fields_request: Mapping[str, Any],
    llm_input: Mapping[str, Any],
    path: str,
) -> list[str]:
    request_ids = _nested_field_candidate_ids(fields_request)
    input_ids = _nested_field_candidate_ids(llm_input)
    errors: list[str] = []
    missing = sorted(set(request_ids) - set(input_ids))
    unexpected = sorted(set(input_ids) - set(request_ids))
    if missing:
        errors.append(f"{path}: LLM input candidateId가 누락됐습니다: {', '.join(missing)}")
    if unexpected:
        errors.append(
            f"{path}: fields request에 없는 candidateId입니다: {', '.join(unexpected)}"
        )
    return errors


def _nested_field_candidate_ids(payload: Mapping[str, Any]) -> list[str]:
    candidate_ids: list[str] = []
    for section in payload.get("sections", []):
        if not isinstance(section, Mapping):
            continue
        candidate_ids.extend(
            candidate["candidateId"]
            for candidate in _section_candidates(section, "fields")
            if isinstance(candidate, Mapping)
            and isinstance(candidate.get("candidateId"), str)
        )
    return candidate_ids


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
    parser.add_argument("--openapi", type=Path, default=root / "llm-wiki/raw/issues/CF-44/documents/api/application-form-analysis.openapi.yaml")
    parser.add_argument("--reference", type=Path, default=root / "llm-wiki/raw/issues/CF-44/documents/api/application-form-analysis-api.md")
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
