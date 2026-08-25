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


class ApplicationFormApiValidatorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name)
        self.openapi_path = self.root / "contract.yaml"
        self.reference_path = self.root / "reference.md"
        self.openapi_path.write_text(OPENAPI, encoding="utf-8")
        self.reference_path.write_text(REFERENCE, encoding="utf-8")

    def test_valid_examples_pass_schema_and_relationship_checks(self) -> None:
        validator = load_validator()
        self.assertEqual([], validator.validate_contract(self.openapi_path, self.reference_path))

    def test_rejects_unknown_and_forbidden_request_properties(self) -> None:
        validator = load_validator()
        self._replace('"control": "text"', '"control": "text", "value": "secret"')

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("forbidden property: value" in error for error in errors))
        self.assertTrue(any("unknown property: value" in error for error in errors))

    def test_rejects_profile_derived_execution_count_in_request(self) -> None:
        validator = load_validator()
        self._replace(
            '"visibility": "visible"',
            '"visibility": "visible", "desiredGroupCount": 3',
            1,
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(
            any("forbidden property: desiredGroupCount" in error for error in errors)
        )
        self.assertTrue(any("unknown property: desiredGroupCount" in error for error in errors))

    def test_rejects_duplicate_candidate_and_invalid_section_parent(self) -> None:
        validator = load_validator()
        self._replace('"candidateId": "field-2"', '"candidateId": "field-1"')
        self._replace('"sectionId": "education"', '"sectionId": "education", "parentSectionId": "missing"')

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("duplicate candidateId" in error for error in errors))
        self.assertTrue(any("parentSectionId" in error for error in errors))

    def test_rejects_unapproved_enum_and_cross_endpoint_candidate(self) -> None:
        validator = load_validator()
        self._replace('"control": "text"', '"control": "slider"', 1)
        self._replace(
            '"sectionId": "root",\n     "actionCandidates"',
            '"sectionId": "root",\n     "fields": [],\n     "actionCandidates"',
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("enum" in error for error in errors))
        self.assertTrue(any("unknown property: fields" in error for error in errors))

    def test_rejects_unresolved_ref_and_object_without_unknown_property_guard(self) -> None:
        validator = load_validator()
        self.openapi_path.write_text(
            self.openapi_path.read_text(encoding="utf-8").replace(
                "additionalProperties: false", "additionalProperties: true", 1
            ),
            encoding="utf-8",
        )
        errors = validator.validate_contract(self.openapi_path, self.reference_path)
        self.assertTrue(any("additionalProperties: false" in error for error in errors))

        self.openapi_path.write_text(
            self.openapi_path.read_text(encoding="utf-8").replace(
                "#/components/schemas/FieldCandidate", "#/components/schemas/Missing"
            ),
            encoding="utf-8",
        )
        errors = validator.validate_contract(self.openapi_path, self.reference_path)
        self.assertTrue(any("$ref" in error for error in errors))

    def test_repository_raw_contract_passes(self) -> None:
        validator = load_validator()
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        self.assertEqual(
            [],
            validator.validate_contract(
                raw_root / "application-form-analysis.openapi.yaml",
                raw_root / "application-form-analysis-api.md",
            ),
        )

    def test_repository_error_codes_match_http_statuses(self) -> None:
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        document = yaml.safe_load(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(encoding="utf-8")
        )
        expected = {
            "400": "INVALID_REQUEST",
            "413": "SNAPSHOT_TOO_LARGE",
            "429": "RATE_LIMITED",
            "500": "INTERNAL_ERROR",
        }
        for path in document["paths"].values():
            for status, code in expected.items():
                response_ref = path["post"]["responses"][status]["$ref"]
                response = document["components"]["responses"][response_ref.rsplit("/", 1)[1]]
                schema_ref = response["content"]["application/json"]["schema"]["$ref"]
                schema = document["components"]["schemas"][schema_ref.rsplit("/", 1)[1]]
                self.assertEqual(code, schema["properties"]["code"]["const"])

    def test_repository_splits_preparation_and_fields_endpoints(self) -> None:
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        document = yaml.safe_load(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(encoding="utf-8")
        )
        self.assertEqual(
            {"/api/v1/preparation/analyze", "/api/v1/fields/analyze"},
            set(document["paths"]),
        )
        for path in document["paths"].values():
            self.assertEqual({"post"}, set(path))

    def test_repository_rejects_repeated_reveal_section_plan(self) -> None:
        validator = load_validator()
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        self.openapi_path.write_text(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        reference = (raw_root / "application-form-analysis-api.md").read_text(
            encoding="utf-8"
        )
        valid_plan = (
            '"command": "ADD_REPEATABLE_GROUP",\n'
            '      "expectedEffect": "GROUP_COUNT_INCREMENT",\n'
            '      "maxExecutions": 3'
        )
        self.assertIn(valid_plan, reference)
        reference = reference.replace(
            valid_plan,
            '"command": "REVEAL_SECTION",\n      "expectedEffect": "TARGET_VISIBLE",\n      "maxExecutions": 3',
            1,
        )
        self.reference_path.write_text(reference, encoding="utf-8")

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("oneOf" in error for error in errors))

    def test_repository_repeatable_group_example_uses_safety_ceiling(self) -> None:
        validator = load_validator()
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        examples = validator._examples(raw_root / "application-form-analysis-api.md")
        response = next(
            example for kind, example in examples if kind == "preparation-response"
        )

        self.assertEqual(
            {
                "actionCandidateId": "action-certification-add",
                "command": "ADD_REPEATABLE_GROUP",
                "expectedEffect": "GROUP_COUNT_INCREMENT",
                "maxExecutions": 3,
            },
            response["preparationPlans"][0],
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
            snapshotId: {type: string}
            site: {$ref: '#/components/schemas/Site'}
            sections:
              type: array
              items: {$ref: '#/components/schemas/PreparationSection'}
        FieldsRequest:
          type: object
          additionalProperties: false
          required: [schemaVersion, snapshotId, site, sections]
          properties:
            schemaVersion: {type: integer, const: 2}
            snapshotId: {type: string}
            site: {$ref: '#/components/schemas/Site'}
            sections:
              type: array
              items: {$ref: '#/components/schemas/FieldsSection'}
        Site:
          type: object
          additionalProperties: false
          required: [host, pathPattern]
          properties:
            host: {type: string}
            pathPattern: {type: string}
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
                  mappingStatus: {type: string, enum: [RULE_MATCHED, UNKNOWN]}
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
    {"snapshotId": "fields-b", "fields": [{"candidateId": "field-1", "mappingStatus": "RULE_MATCHED", "interactionStatus": "READY", "writePlan": {"command": "SET_TEXT"}}]}
    ```
    """
).lstrip()


if __name__ == "__main__":
    unittest.main()
