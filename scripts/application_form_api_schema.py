import re
from collections.abc import Mapping
from typing import Any


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


def _openapi_structure_errors(document: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    paths = document.get("paths")
    expected_paths = {"/api/v1/preparation/analyze", "/api/v1/fields/analyze"}
    if not isinstance(paths, Mapping) or set(paths) != expected_paths:
        errors.append("외부 API path는 preparation 및 fields POST 두 개여야 합니다")
    elif any(set(paths[path]) != {"post"} for path in expected_paths):
        errors.append("외부 API method는 각 path마다 POST 하나여야 합니다")

    errors.extend(_schema_tree_errors(document, document, "openapi"))
    if document.get("info", {}).get("version") == "3.0.0":
        errors.extend(_current_contract_errors(document))
    return errors


def _schema_tree_errors(
    value: Any,
    document: Mapping[str, Any],
    path: str,
) -> list[str]:
    if isinstance(value, list):
        return [
            error
            for index, child in enumerate(value)
            for error in _schema_tree_errors(child, document, f"{path}[{index}]")
        ]
    if not isinstance(value, Mapping):
        return []

    errors = _schema_node_errors(value, document, path)
    errors.extend(
        error
        for name, child in value.items()
        for error in _schema_tree_errors(child, document, f"{path}.{name}")
    )
    return errors


def _schema_node_errors(
    value: Mapping[str, Any],
    document: Mapping[str, Any],
    path: str,
) -> list[str]:
    errors: list[str] = []
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
    return errors


def _current_contract_errors(document: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    if "x-snapshot-byte-limits" in document:
        errors.append("x-snapshot-byte-limits는 현재 계약에서 사용하지 않습니다")
    errors.extend(_removed_contract_feature_errors(document))
    errors.extend(_current_response_errors(document))
    return errors


def _removed_contract_feature_errors(document: Mapping[str, Any]) -> list[str]:
    components = document.get("components", {})
    if not isinstance(components, Mapping):
        return []

    removed_components = {
        "schemas": {"SnapshotTooLarge", "SnapshotTooLargeError"},
        "responses": {"SnapshotTooLarge"},
    }
    errors: list[str] = []
    for component_kind, removed_names in removed_components.items():
        values = components.get(component_kind, {})
        if not isinstance(values, Mapping):
            continue
        errors.extend(
            f"components.{component_kind}.{name}는 현재 계약에서 사용하지 않습니다"
            for name in sorted(removed_names & set(values))
        )
    if _uses_removed_error_code(components):
        errors.append(
            "SNAPSHOT_TOO_LARGE error code는 현재 계약에서 사용하지 않습니다"
        )
    return errors


def _uses_removed_error_code(value: Any) -> bool:
    if isinstance(value, Mapping):
        return value.get("const") == "SNAPSHOT_TOO_LARGE" or any(
            _uses_removed_error_code(child) for child in value.values()
        )
    if isinstance(value, list):
        return any(_uses_removed_error_code(child) for child in value)
    return False


def _current_response_errors(document: Mapping[str, Any]) -> list[str]:
    paths = document.get("paths", {})
    if not isinstance(paths, Mapping):
        return []

    errors: list[str] = []
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
        if set(responses) != {"200", "400", "500"}:
            errors.append(f"{path}: response status는 200/400/500만 허용합니다")
        errors.extend(_error_response_code_errors(path, responses, document))
    return errors


def _error_response_code_errors(
    path: str,
    responses: Mapping[str, Any],
    document: Mapping[str, Any],
) -> list[str]:
    errors: list[str] = []
    for status, expected_code in {"400": "INVALID_REQUEST", "500": "INTERNAL_ERROR"}.items():
        response_schema = responses.get(status)
        if not isinstance(response_schema, Mapping):
            continue
        try:
            response = _resolve(response_schema, document)
            schema = _resolve(
                response["content"]["application/json"]["schema"],
                document,
            )
            if schema["properties"]["code"].get("const") != expected_code:
                errors.append(f"{path} {status}: error code는 {expected_code}여야 합니다")
        except (KeyError, TypeError, ValueError):
            errors.append(f"{path} {status}: error response schema를 확인할 수 없습니다")
    return errors


def _validate_schema(
    value: Any,
    schema: Mapping[str, Any],
    document: Mapping[str, Any],
    path: str,
) -> list[str]:
    schema = _resolve(schema, document)
    errors = _composition_errors(value, schema, document, path)
    if "oneOf" in schema:
        return errors

    errors.extend(_literal_constraint_errors(value, schema, path))
    expected_types = _expected_types(schema)
    if expected_types and not any(
        isinstance(expected, str) and _has_type(value, expected)
        for expected in expected_types
    ):
        expected_label = "/".join(
            expected for expected in expected_types if isinstance(expected, str)
        )
        return [f"{path}: {expected_label} 타입이 아닙니다"]
    if value is None:
        return errors
    if "string" in expected_types:
        errors.extend(_string_constraint_errors(value, schema, path))
    if "object" in expected_types:
        errors.extend(_object_errors(value, schema, document, path))
    if "array" in expected_types:
        errors.extend(_array_errors(value, schema, document, path))
    return errors


def _composition_errors(
    value: Any,
    schema: Mapping[str, Any],
    document: Mapping[str, Any],
    path: str,
) -> list[str]:
    errors = [
        error
        for child in schema.get("allOf", [])
        for error in _validate_schema(value, child, document, path)
    ]
    if "oneOf" not in schema:
        return errors
    matches = [
        _validate_schema(value, child, document, path)
        for child in schema["oneOf"]
    ]
    if sum(not result for result in matches) != 1:
        errors.append(f"{path}: oneOf 조건을 만족하지 않습니다")
    return errors


def _literal_constraint_errors(
    value: Any,
    schema: Mapping[str, Any],
    path: str,
) -> list[str]:
    errors: list[str] = []
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: const가 일치하지 않습니다")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: enum에 없는 값입니다")
    return errors


def _expected_types(schema: Mapping[str, Any]) -> list[Any]:
    declared = schema.get("type")
    if isinstance(declared, str):
        return [declared]
    if isinstance(declared, list):
        return declared
    return []


def _string_constraint_errors(
    value: str,
    schema: Mapping[str, Any],
    path: str,
) -> list[str]:
    errors: list[str] = []
    minimum_length = schema.get("minLength")
    if isinstance(minimum_length, int) and len(value) < minimum_length:
        errors.append(f"{path}: minLength를 만족하지 않습니다")
    maximum_length = schema.get("maxLength")
    if isinstance(maximum_length, int) and len(value) > maximum_length:
        errors.append(f"{path}: maxLength를 만족하지 않습니다")
    pattern = schema.get("pattern")
    if isinstance(pattern, str) and re.fullmatch(pattern, value) is None:
        errors.append(f"{path}: pattern을 만족하지 않습니다")
    return errors


def _object_errors(
    value: Mapping[str, Any],
    schema: Mapping[str, Any],
    document: Mapping[str, Any],
    path: str,
) -> list[str]:
    properties = schema.get("properties", {})
    errors = [
        f"{path}: required property가 없습니다: {name}"
        for name in schema.get("required", [])
        if name not in value
    ]
    for name, child in value.items():
        if name not in properties:
            if schema.get("additionalProperties") is False:
                errors.append(f"{path}: unknown property: {name}")
            continue
        errors.extend(
            _validate_schema(child, properties[name], document, f"{path}.{name}")
        )
    return errors


def _array_errors(
    value: list[Any],
    schema: Mapping[str, Any],
    document: Mapping[str, Any],
    path: str,
) -> list[str]:
    errors: list[str] = []
    minimum_items = schema.get("minItems")
    if isinstance(minimum_items, int) and len(value) < minimum_items:
        errors.append(f"{path}: minItems를 만족하지 않습니다")
    maximum_items = schema.get("maxItems")
    if isinstance(maximum_items, int) and len(value) > maximum_items:
        errors.append(f"{path}: maxItems를 만족하지 않습니다")
    errors.extend(
        error
        for index, child in enumerate(value)
        for error in _validate_schema(
            child,
            schema.get("items", {}),
            document,
            f"{path}[{index}]",
        )
    )
    return errors


def _resolve(
    schema: Mapping[str, Any],
    document: Mapping[str, Any],
) -> Mapping[str, Any]:
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
        "null": value is None,
    }.get(expected, True)


def _forbidden_property_errors(value: Any, path: str) -> list[str]:
    if isinstance(value, Mapping):
        errors = [
            f"{path}: forbidden property: {name}"
            for name in value
            if name.lower() in FORBIDDEN_PROPERTIES
        ]
        errors.extend(
            error
            for name, child in value.items()
            for error in _forbidden_property_errors(child, f"{path}.{name}")
        )
        return errors
    if isinstance(value, list):
        return [
            error
            for index, child in enumerate(value)
            for error in _forbidden_property_errors(child, f"{path}[{index}]")
        ]
    return []
