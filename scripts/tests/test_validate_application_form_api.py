import importlib.util
import tempfile
import textwrap
import unittest
from pathlib import Path


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

        self.assertEqual(
            [],
            validator.validate_contract(self.openapi_path, self.reference_path),
        )

    def test_rejects_unknown_and_forbidden_request_properties(self) -> None:
        validator = load_validator()
        self._replace('"control": "text"', '"control": "text", "value": "secret"')

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("forbidden property: value" in error for error in errors))
        self.assertTrue(any("unknown property: value" in error for error in errors))

    def test_rejects_duplicate_candidate_and_invalid_section_parent(self) -> None:
        validator = load_validator()
        self._replace('"candidateId": "field-2"', '"candidateId": "field-1"')
        self._replace('"sectionId": "education"', '"sectionId": "education", "parentSectionId": "missing"')

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("duplicate candidateId" in error for error in errors))
        self.assertTrue(any("parentSectionId" in error for error in errors))

    def test_rejects_unapproved_enums_and_mixed_response_plans(self) -> None:
        validator = load_validator()
        self._replace('"control": "text"', '"control": "slider"', 1)
        self._replace(
            '"fields": []\n}',
            '"fields": [{"candidateId": "field-1", "mappingStatus": "RULE_MATCHED", "interactionStatus": "READY", "writePlan": {"command": "SET_TEXT"}}]\n}',
            1,
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("enum" in error for error in errors))
        self.assertTrue(any("preparationPlans and writePlan" in error for error in errors))

    def _replace(self, old: str, new: str, count: int = -1) -> None:
        reference = self.reference_path.read_text(encoding="utf-8")
        self.assertIn(old, reference)
        self.reference_path.write_text(reference.replace(old, new, count), encoding="utf-8")


OPENAPI = textwrap.dedent(
    """
    openapi: 3.1.0
    components:
      schemas:
        AnalyzeRequest:
          type: object
          additionalProperties: false
          required: [schemaVersion, snapshotId, site, sections]
          properties:
            schemaVersion: {type: integer, const: 1}
            snapshotId: {type: string}
            site:
              type: object
              additionalProperties: false
              required: [host, pathPattern]
              properties:
                host: {type: string}
                pathPattern: {type: string}
            sections:
              type: array
              items:
                type: object
                additionalProperties: false
                required: [sectionId, fields]
                properties:
                  sectionId: {type: string}
                  parentSectionId: {type: string}
                  fields:
                    type: array
                    items:
                      $ref: '#/components/schemas/Candidate'
                  actionCandidates:
                    type: array
                    items:
                      $ref: '#/components/schemas/Candidate'
        Candidate:
          type: object
          additionalProperties: false
          required: [candidateId, element, control, visibility]
          properties:
            candidateId: {type: string}
            element: {type: string, enum: [input, button]}
            control: {type: string, enum: [text, button]}
            visibility: {type: string, enum: [visible, hidden]}
        AnalyzeResponse:
          type: object
          additionalProperties: false
          required: [snapshotId, analysisStatus, fields]
          properties:
            snapshotId: {type: string}
            analysisStatus: {type: string, enum: [COMPLETE, PARTIAL, BLOCKED]}
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
            preparationPlans:
              type: array
              items:
                type: object
                additionalProperties: false
                required: [actionCandidateId, command]
                properties:
                  actionCandidateId: {type: string}
                  command: {type: string, enum: [REVEAL_SECTION]}
    """
).lstrip()

REFERENCE = textwrap.dedent(
    """
    <!-- api-example: request -->
    ```json
    {
      "schemaVersion": 1,
      "snapshotId": "snapshot-a",
      "site": {"host": "example.test", "pathPattern": "/apply/*"},
      "sections": [
        {"sectionId": "root", "fields": [
          {"candidateId": "field-1", "element": "input", "control": "text", "visibility": "visible"},
          {"candidateId": "field-2", "element": "input", "control": "text", "visibility": "visible"}
        ]},
        {"sectionId": "education", "fields": [], "actionCandidates": [
          {"candidateId": "action-1", "element": "button", "control": "button", "visibility": "visible"}
        ]}
      ]
    }
    ```

    <!-- api-example: response -->
    ```json
    {
      "snapshotId": "snapshot-a",
      "analysisStatus": "COMPLETE",
      "preparationPlans": [{"actionCandidateId": "action-1", "command": "REVEAL_SECTION"}],
      "fields": []
    }
    ```
    """
).lstrip()


if __name__ == "__main__":
    unittest.main()
