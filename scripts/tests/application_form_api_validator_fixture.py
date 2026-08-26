import copy
import importlib.util
import tempfile
import textwrap
import unittest
from pathlib import Path

import yaml

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
VALIDATOR_PATH = REPOSITORY_ROOT / "scripts" / "validate-application-form-api.py"


def load_validator():
    specification = importlib.util.spec_from_file_location(
        "application_form_api_validator", VALIDATOR_PATH
    )
    assert specification is not None and specification.loader is not None
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


class ApplicationFormApiValidatorTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name)
        self.openapi_path = self.root / "contract.yaml"
        self.reference_path = self.root / "reference.md"
        self.openapi_path.write_text(OPENAPI, encoding="utf-8")
        self.reference_path.write_text(REFERENCE, encoding="utf-8")

    @staticmethod
    def _current_contract_document() -> dict:
        operations = {}
        for path in (
            "/api/v1/preparation/analyze",
            "/api/v1/fields/analyze",
        ):
            operations[path] = {
                "post": {
                    "responses": {
                        "200": {"description": "ok"},
                        "400": {"$ref": "#/components/responses/InvalidRequest"},
                        "413": {"$ref": "#/components/responses/SnapshotTooLarge"},
                        "500": {"$ref": "#/components/responses/InternalError"},
                    }
                }
            }
        schemas = {}
        responses = {}
        for name, code in (
            ("InvalidRequest", "INVALID_REQUEST"),
            ("SnapshotTooLarge", "SNAPSHOT_TOO_LARGE"),
            ("InternalError", "INTERNAL_ERROR"),
        ):
            schemas[name] = {
                "type": "object",
                "additionalProperties": False,
                "required": ["code", "message"],
                "properties": {
                    "code": {"type": "string", "const": code},
                    "message": {"type": "string"},
                },
            }
            responses[name] = {
                "description": name,
                "content": {
                    "application/json": {
                        "schema": {"$ref": f"#/components/schemas/{name}"}
                    }
                },
            }
        return {
            "info": {"version": "3.0.0"},
            "x-snapshot-byte-limits": {"raw": 65_536, "canonical": 65_536},
            "paths": operations,
            "components": {"responses": responses, "schemas": schemas},
        }

    def _use_successor_contract(self) -> None:
        document = yaml.safe_load(self.openapi_path.read_text(encoding="utf-8"))
        document["info"] = {"title": "Synthetic successor", "version": "3.0.0"}
        current_contract = self._current_contract_document()
        document["x-snapshot-byte-limits"] = current_contract[
            "x-snapshot-byte-limits"
        ]
        schemas = document["components"]["schemas"]
        schemas.update(SUCCESSOR_SCHEMAS)
        schemas.update(current_contract["components"]["schemas"])
        document["components"]["responses"] = current_contract["components"][
            "responses"
        ]
        for path, path_item in document["paths"].items():
            path_item["post"]["responses"].update(
                {
                    status: copy.deepcopy(response)
                    for status, response in current_contract["paths"][path]["post"][
                        "responses"
                    ].items()
                    if status != "200"
                }
            )
        for request_name in ("PreparationRequest", "FieldsRequest"):
            schemas[request_name]["properties"]["snapshotId"]["maxLength"] = 128
        schemas["Site"]["properties"]["host"]["maxLength"] = 253
        schemas["Site"]["properties"]["pathPattern"]["maxLength"] = 512
        for section_name in ("PreparationSection", "FieldsSection"):
            schemas[section_name]["properties"]["sectionId"]["maxLength"] = 128
            schemas[section_name]["properties"]["parentSectionId"][
                "maxLength"
            ] = 128
        for candidate_name in ("ActionCandidate", "FieldCandidate"):
            schemas[candidate_name]["properties"]["candidateId"]["maxLength"] = 128
        response_properties = {
            "mode": {"type": "string", "enum": ["GENERIC", "ADAPTER"]},
            "analysisStatus": {
                "type": "string",
                "enum": ["COMPLETE", "PARTIAL", "BLOCKED"],
            },
            "warningCodes": {
                "type": "array",
                "items": {"type": "string", "enum": ["LLM_UNAVAILABLE"]},
            },
        }
        schemas["PreparationResponse"]["properties"].update(response_properties)
        schemas["FieldsResponse"]["properties"].update(response_properties)
        self.openapi_path.write_text(
            yaml.safe_dump(document, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
        self.reference_path.write_text(
            self.reference_path.read_text(encoding="utf-8")
            + SUCCESSOR_REFERENCE_SUFFIX,
            encoding="utf-8",
        )

    def _replace_after(self, marker: str, old: str, new: str) -> None:
        reference = self.reference_path.read_text(encoding="utf-8")
        self.assertIn(marker, reference)
        prefix, suffix = reference.split(marker, 1)
        self.assertIn(old, suffix)
        self.reference_path.write_text(
            prefix + marker + suffix.replace(old, new, 1),
            encoding="utf-8",
        )

    def _replace(self, old: str, new: str, count: int = -1) -> None:
        reference = self.reference_path.read_text(encoding="utf-8")
        self.assertIn(old, reference)
        self.reference_path.write_text(reference.replace(old, new, count), encoding="utf-8")


OPENAPI = textwrap.dedent(
    """
    openapi: 3.1.0
    paths:
      /api/v1/preparation/analyze:
        post:
          requestBody:
            content:
              application/json:
                schema: {$ref: '#/components/schemas/PreparationRequest'}
          responses:
            '200':
              content:
                application/json:
                  schema: {$ref: '#/components/schemas/PreparationResponse'}
      /api/v1/fields/analyze:
        post:
          requestBody:
            content:
              application/json:
                schema: {$ref: '#/components/schemas/FieldsRequest'}
          responses:
            '200':
              content:
                application/json:
                  schema: {$ref: '#/components/schemas/FieldsResponse'}
    components:
      schemas:
        PreparationRequest:
          type: object
          additionalProperties: false
          required: [schemaVersion, snapshotId, site, sections]
          properties:
            schemaVersion: {type: integer, const: 2}
            snapshotId: {type: string, minLength: 1}
            site: {$ref: '#/components/schemas/Site'}
            sections:
              type: array
              minItems: 1
              items: {$ref: '#/components/schemas/PreparationSection'}
        FieldsRequest:
          type: object
          additionalProperties: false
          required: [schemaVersion, snapshotId, site, sections]
          properties:
            schemaVersion: {type: integer, const: 2}
            snapshotId: {type: string, minLength: 1}
            site: {$ref: '#/components/schemas/Site'}
            sections:
              type: array
              minItems: 1
              items: {$ref: '#/components/schemas/FieldsSection'}
        Site:
          type: object
          additionalProperties: false
          required: [host, pathPattern]
          properties:
            host: {type: string, minLength: 1, pattern: '^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$'}
            pathPattern: {type: string, minLength: 1, pattern: '^/[^?#]*$'}
        PreparationSection:
          type: object
          additionalProperties: false
          required: [sectionId, actionCandidates]
          properties:
            sectionId: {type: string}
            parentSectionId: {type: string}
            actionCandidates:
              type: array
              items: {$ref: '#/components/schemas/ActionCandidate'}
        FieldsSection:
          type: object
          additionalProperties: false
          required: [sectionId, fields]
          properties:
            sectionId: {type: string}
            parentSectionId: {type: string}
            fields:
              type: array
              items: {$ref: '#/components/schemas/FieldCandidate'}
        ActionCandidate:
          type: object
          additionalProperties: false
          required: [candidateId, element, control, visibility]
          properties:
            candidateId: {type: string}
            element: {type: string, enum: [button]}
            control: {type: string, enum: [button]}
            visibility: {type: string, enum: [visible, hidden]}
        FieldCandidate:
          type: object
          additionalProperties: false
          required: [candidateId, element, control, visibility]
          properties:
            candidateId: {type: string}
            element: {type: string, enum: [input]}
            control: {type: string, enum: [text]}
            visibility: {type: string, enum: [visible, hidden]}
        PreparationResponse:
          type: object
          additionalProperties: false
          required: [snapshotId, preparationPlans]
          properties:
            snapshotId: {type: string}
            preparationPlans:
              type: array
              items:
                type: object
                additionalProperties: false
                required: [actionCandidateId, command]
                properties:
                  actionCandidateId: {type: string}
                  command: {type: string, enum: [REVEAL_SECTION]}
        FieldsResponse:
          type: object
          additionalProperties: false
          required: [snapshotId, fields]
          properties:
            snapshotId: {type: string}
            fields:
              type: array
              items:
                type: object
                additionalProperties: false
                required: [candidateId, mappingStatus, interactionStatus]
                properties:
                  candidateId: {type: string}
                  mappingStatus: {type: string, enum: [LLM_SUGGESTED, UNKNOWN]}
                  interactionStatus: {type: string, enum: [READY, UNVERIFIED]}
                  writePlan:
                    type: object
                    additionalProperties: false
                    required: [command]
                    properties:
                      command: {type: string, enum: [SET_TEXT]}
    """
).lstrip()

REFERENCE = textwrap.dedent(
    """
    <!-- api-example: preparation-request -->
    ```json
    {
      "schemaVersion": 2,
      "snapshotId": "preparation-a",
      "site": {"host": "example.test", "pathPattern": "/apply/*"},
      "sections": [
        {"sectionId": "root",
         "actionCandidates": [{"candidateId": "action-1", "element": "button", "control": "button", "visibility": "visible"}]}
      ]
    }
    ```

    <!-- api-example: preparation-response -->
    ```json
    {"snapshotId": "preparation-a", "preparationPlans": [{"actionCandidateId": "action-1", "command": "REVEAL_SECTION"}]}
    ```

    <!-- api-example: fields-request -->
    ```json
    {
      "schemaVersion": 2,
      "snapshotId": "fields-b",
      "site": {"host": "example.test", "pathPattern": "/apply/*"},
      "sections": [
        {"sectionId": "root", "fields": [{"candidateId": "field-1", "element": "input", "control": "text", "visibility": "visible"}]},
        {"sectionId": "education", "fields": [{"candidateId": "field-2", "element": "input", "control": "text", "visibility": "visible"}]}
      ]
    }
    ```

    <!-- api-example: fields-response -->
    ```json
    {"snapshotId": "fields-b", "fields": [{"candidateId": "field-1", "mappingStatus": "LLM_SUGGESTED", "interactionStatus": "READY", "writePlan": {"command": "SET_TEXT"}}]}
    ```
    """
).lstrip()

SUCCESSOR_SCHEMAS = yaml.safe_load(
    textwrap.dedent(
        """
        LlmActionInput:
          type: object
          additionalProperties: false
          required: [schemaVersion, snapshotId, sections]
          properties:
            schemaVersion: {type: integer, const: 2}
            snapshotId: {type: string, minLength: 1, maxLength: 128}
            sections:
              type: array
              items: {$ref: '#/components/schemas/LlmActionSection'}
        LlmActionSection:
          type: object
          additionalProperties: false
          required: [sectionId, actionCandidates]
          properties:
            sectionId: {type: string, minLength: 1, maxLength: 128}
            parentSectionId: {type: string, minLength: 1, maxLength: 128}
            displayName: {type: string, minLength: 1, maxLength: 120}
            actionCandidates:
              type: array
              items: {$ref: '#/components/schemas/LlmActionCandidate'}
            items:
              type: array
              minItems: 1
              items: {$ref: '#/components/schemas/LlmActionItem'}
        LlmActionItem:
          type: object
          additionalProperties: false
          required: [itemId, actionCandidates]
          properties:
            itemId: {type: string, minLength: 1, maxLength: 128}
            actionCandidates:
              type: array
              minItems: 1
              items: {$ref: '#/components/schemas/LlmActionCandidate'}
        LlmActionCandidate:
          type: object
          additionalProperties: false
          required: [candidateId, element, control, visibility]
          properties:
            candidateId: {type: string, minLength: 1, maxLength: 128}
            displayName: {type: string, minLength: 1, maxLength: 120}
            element: {type: string, enum: [button, input, custom]}
            control: {type: string, enum: [button, custom]}
            visibility: {type: string, enum: [visible, hidden]}
            domId: {type: string, minLength: 1, maxLength: 120}
            domName: {type: string, minLength: 1, maxLength: 120}
            disabled: {type: boolean, const: true}
            readonly: {type: boolean, const: true}
            inert: {type: boolean, const: true}
        LlmActionOutput:
          type: object
          additionalProperties: false
          required: [schemaVersion, snapshotId, results]
          properties:
            schemaVersion: {type: integer, const: 2}
            snapshotId: {type: string, minLength: 1, maxLength: 128}
            results:
              type: array
              items:
                oneOf:
                  - {$ref: '#/components/schemas/LlmRevealActionResult'}
                  - {$ref: '#/components/schemas/LlmAddActionResult'}
                  - {$ref: '#/components/schemas/LlmNoActionResult'}
        LlmRevealActionResult:
          type: object
          additionalProperties: false
          required: [candidateId, actionType, command, expectedEffect, targetSectionId]
          properties:
            candidateId: {type: string, minLength: 1, maxLength: 128}
            actionType: {type: string, const: ACTION}
            command: {type: string, const: REVEAL_SECTION}
            expectedEffect: {type: string, const: TARGET_VISIBLE}
            targetSectionId: {type: string, minLength: 1, maxLength: 128}
        LlmAddActionResult:
          type: object
          additionalProperties: false
          required: [candidateId, actionType, command, expectedEffect]
          properties:
            candidateId: {type: string, minLength: 1, maxLength: 128}
            actionType: {type: string, const: ACTION}
            command: {type: string, const: ADD_REPEATABLE_GROUP}
            expectedEffect: {type: string, const: GROUP_COUNT_INCREMENT}
        LlmNoActionResult:
          type: object
          additionalProperties: false
          required: [candidateId, actionType]
          properties:
            candidateId: {type: string, minLength: 1, maxLength: 128}
            actionType: {type: string, const: NO_ACTION}
        LlmMappingInput:
          type: object
          additionalProperties: false
          required: [schemaVersion, snapshotId, sections]
          properties:
            schemaVersion: {type: integer, const: 2}
            snapshotId: {type: string, minLength: 1, maxLength: 128}
            sections:
              type: array
              items: {$ref: '#/components/schemas/LlmFieldSection'}
        LlmFieldSection:
          type: object
          additionalProperties: false
          required: [sectionId, fields]
          properties:
            sectionId: {type: string, minLength: 1, maxLength: 128}
            fields:
              type: array
              items: {$ref: '#/components/schemas/LlmFieldCandidate'}
        LlmFieldCandidate:
          type: object
          additionalProperties: false
          required: [candidateId, element, control]
          properties:
            candidateId: {type: string, minLength: 1, maxLength: 128}
            element: {type: string, enum: [input, select, textarea, custom]}
            control: {type: string, enum: [text, select, radio, checkbox, textarea, custom]}
        LlmMappingOutput:
          type: object
          additionalProperties: false
          required: [schemaVersion, snapshotId, results]
          properties:
            schemaVersion: {type: integer, const: 2}
            snapshotId: {type: string, minLength: 1, maxLength: 128}
            results:
              type: array
              items:
                oneOf:
                  - {$ref: '#/components/schemas/LlmMatchedResult'}
                  - {$ref: '#/components/schemas/LlmNoMatchResult'}
        LlmMatchedResult:
          type: object
          additionalProperties: false
          required: [candidateId, matchType, profileFieldKey]
          properties:
            candidateId: {type: string, minLength: 1, maxLength: 128}
            matchType: {type: string, const: MATCH}
            profileFieldKey: {type: string}
        LlmNoMatchResult:
          type: object
          additionalProperties: false
          required: [candidateId, matchType]
          properties:
            candidateId: {type: string, minLength: 1, maxLength: 128}
            matchType: {type: string, const: NO_MATCH}
        """
    )
)

SUCCESSOR_REFERENCE_SUFFIX = textwrap.dedent(
    """

    <!-- llm-example: action-input -->
    ```json
    {
      "schemaVersion": 2,
      "snapshotId": "preparation-a",
      "sections": [{
        "sectionId": "root",
        "actionCandidates": [{
          "candidateId": "action-1",
          "element": "button",
          "control": "button",
          "visibility": "visible"
        }]
      }]
    }
    ```

    <!-- llm-example: action-output -->
    ```json
    {
      "schemaVersion": 2,
      "snapshotId": "preparation-a",
      "results": [
        {"candidateId": "action-1", "actionType": "NO_ACTION"}
      ]
    }
    ```

    <!-- llm-example: mapping-input -->
    ```json
    {
      "schemaVersion": 2,
      "snapshotId": "fields-b",
      "sections": [
        {"sectionId": "root", "fields": [
          {"candidateId": "field-1", "element": "input", "control": "text"}
        ]},
        {"sectionId": "education", "fields": [
          {"candidateId": "field-2", "element": "input", "control": "text"}
        ]}
      ]
    }
    ```

    <!-- llm-example: mapping-output -->
    ```json
    {
      "schemaVersion": 2,
      "snapshotId": "fields-b",
      "results": [
        {"candidateId": "field-1", "matchType": "NO_MATCH"},
        {"candidateId": "field-2", "matchType": "NO_MATCH"}
      ]
    }
    ```
    """
)
