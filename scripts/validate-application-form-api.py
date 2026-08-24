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
    "authorization",
}
EXAMPLE_PATTERN = re.compile(
    r"<!-- api-example: (request|response) -->\s*```json\s*(.*?)```",
    re.DOTALL,
)


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
    request_schema = schemas.get("AnalyzeRequest")
    response_schema = schemas.get("AnalyzeResponse")
    if not isinstance(request_schema, Mapping) or not isinstance(response_schema, Mapping):
        return ["AnalyzeRequest와 AnalyzeResponse schema가 필요합니다"]

    errors: list[str] = []
    requests: dict[str, Mapping[str, Any]] = {}
    try:
        examples = _examples(reference_path)
    except (OSError, ValueError) as error:
        return [str(error)]
    for index, (kind, example) in enumerate(examples, start=1):
        prefix = f"example {index} ({kind})"
        schema = request_schema if kind == "request" else response_schema
        errors.extend(_validate_schema(example, schema, document, prefix))
        errors.extend(_forbidden_property_errors(example, prefix))
        if kind == "request" and isinstance(example, Mapping):
            snapshot_id = example.get("snapshotId")
            if isinstance(snapshot_id, str):
                requests[snapshot_id] = example
            errors.extend(_request_relationship_errors(example, prefix))
        if kind == "response" and isinstance(example, Mapping):
            errors.extend(_response_relationship_errors(example, requests, prefix))
    return errors


def _examples(reference_path: Path) -> list[tuple[str, Any]]:
    content = reference_path.read_text(encoding="utf-8")
    examples: list[tuple[str, Any]] = []
    for kind, body in EXAMPLE_PATTERN.findall(content):
        try:
            examples.append((kind, json.loads(body)))
        except json.JSONDecodeError as error:
            raise ValueError(f"{kind} JSON 예시를 읽을 수 없습니다: {error}") from error
    if not examples:
        raise ValueError("api-example 표식이 있는 JSON 예시가 없습니다")
    return examples


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
        for collection in ("fields", "actionCandidates"):
            for candidate in section.get(collection, []):
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


def _response_relationship_errors(response: Mapping[str, Any], requests: Mapping[str, Mapping[str, Any]], path: str) -> list[str]:
    errors: list[str] = []
    has_preparation = bool(response.get("preparationPlans"))
    has_write_plan = any(
        isinstance(field, Mapping) and "writePlan" in field
        for field in response.get("fields", [])
    )
    if has_preparation and has_write_plan:
        errors.append(f"{path}: preparationPlans and writePlan은 함께 반환할 수 없습니다")
    request = requests.get(response.get("snapshotId"))
    if request is None:
        return errors
    field_ids, action_ids = _request_candidate_ids(request)
    for field in response.get("fields", []):
        if isinstance(field, Mapping) and field.get("candidateId") not in field_ids:
            errors.append(f"{path}: field candidateId가 요청에 없습니다")
    for plan in response.get("preparationPlans", []):
        if isinstance(plan, Mapping) and plan.get("actionCandidateId") not in action_ids:
            errors.append(f"{path}: actionCandidateId가 요청에 없습니다")
    return errors


def _request_candidate_ids(request: Mapping[str, Any]) -> tuple[set[str], set[str]]:
    fields: set[str] = set()
    actions: set[str] = set()
    for section in request.get("sections", []):
        if not isinstance(section, Mapping):
            continue
        fields.update(
            candidate["candidateId"]
            for candidate in section.get("fields", [])
            if isinstance(candidate, Mapping) and isinstance(candidate.get("candidateId"), str)
        )
        actions.update(
            candidate["candidateId"]
            for candidate in section.get("actionCandidates", [])
            if isinstance(candidate, Mapping) and isinstance(candidate.get("candidateId"), str)
        )
    return fields, actions


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--openapi", type=Path, default=root / "llm-wiki/raw/issues/CF-44/documents/api/application-form-analysis.openapi.yaml")
    parser.add_argument("--reference", type=Path, default=root / "llm-wiki/raw/issues/CF-44/documents/api/application-form-analysis-api.md")
    arguments = parser.parse_args()
    errors = validate_contract(arguments.openapi, arguments.reference)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("지원서 분석 API 계약 검증을 통과했습니다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
