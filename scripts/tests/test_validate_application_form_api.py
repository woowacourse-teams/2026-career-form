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

    def test_rejects_account_property_as_forbidden_data(self) -> None:
        validator = load_validator()
        self._replace(
            '"control": "text"', '"control": "text", "account": "synthetic"'
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("forbidden property: account" in error for error in errors))

    def test_rejects_forbidden_properties_declared_by_schema(self) -> None:
        validator = load_validator()
        document = self.openapi_path.read_text(encoding="utf-8")
        self.assertIn("        visibility: {type: string", document)
        self.openapi_path.write_text(
            document.replace(
                "        visibility: {type: string",
                "        selector: {type: string}\n        visibility: {type: string",
                1,
            ),
            encoding="utf-8",
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(
            any("forbidden schema property: selector" in error for error in errors),
            errors,
        )

    def test_rejects_site_values_outside_host_and_path_boundary(self) -> None:
        validator = load_validator()
        original = self.reference_path.read_text(encoding="utf-8")
        invalid_replacements = (
            ('"host": "example.test"', '"host": "https://example.test"'),
            ('"host": "example.test"', '"host": "example.test?token=x"'),
            ('"host": "example.test"', '"host": "example.test#form"'),
            ('"pathPattern": "/apply/*"', '"pathPattern": "apply/*"'),
            ('"pathPattern": "/apply/*"', '"pathPattern": "/apply/?token=x"'),
            ('"pathPattern": "/apply/*"', '"pathPattern": "/apply/#form"'),
        )
        for old, new in invalid_replacements:
            with self.subTest(value=new):
                self.reference_path.write_text(
                    original.replace(old, new, 1), encoding="utf-8"
                )
                errors = validator.validate_contract(
                    self.openapi_path, self.reference_path
                )
                self.assertTrue(any("pattern" in error for error in errors))

    def test_rejects_schema_minimum_keyword_violations(self) -> None:
        validator = load_validator()
        document = yaml.safe_load(self.openapi_path.read_text(encoding="utf-8"))
        schemas = document["components"]["schemas"]

        self.assertTrue(
            validator._validate_schema(
                "", schemas["PreparationRequest"]["properties"]["snapshotId"], document, "snapshotId"
            )
        )
        self.assertTrue(
            validator._validate_schema(
                [], schemas["PreparationRequest"]["properties"]["sections"], document, "sections"
            )
        )

    def test_rejects_response_without_matching_request(self) -> None:
        validator = load_validator()
        self._replace('"snapshotId": "fields-b", "fields"', '"snapshotId": "fields-typo", "fields"')

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("일치하는 요청 예시가 없습니다" in error for error in errors))

    def test_response_relationship_check_is_independent_of_example_order(self) -> None:
        validator = load_validator()
        reference = self.reference_path.read_text(encoding="utf-8")
        response_marker = "<!-- api-example: fields-response -->"
        request_marker = "<!-- api-example: fields-request -->"
        prefix, response = reference.split(response_marker, 1)
        preparation, request = prefix.split(request_marker, 1)
        reordered = (
            preparation
            + response_marker
            + response
            + "\n"
            + request_marker
            + request
        )
        self.reference_path.write_text(reordered, encoding="utf-8")

        self.assertEqual(
            [], validator.validate_contract(self.openapi_path, self.reference_path)
        )

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

    def test_repository_uses_one_canonical_profile_field_contract(self) -> None:
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        document = yaml.safe_load(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(
                encoding="utf-8"
            )
        )
        schemas = document["components"]["schemas"]
        profile_field_key = schemas.get("ProfileFieldKey")
        self.assertIsNotNone(profile_field_key)
        keys = set(profile_field_key["enum"])
        policies = profile_field_key["x-autofill-policies"]

        self.assertEqual(keys, set(policies))
        self.assertIn("certifications.certificate.name", keys)
        self.assertIn("languages.languageTest.testName", keys)
        self.assertIn("education.university.startDate", keys)
        self.assertIn("projects.project.startDate", keys)
        self.assertNotIn("startDate", keys)
        self.assertNotIn("grade", keys)
        self.assertNotIn("testName", keys)
        self.assertNotIn("languages.languageTest.evidenceDocumentPath", keys)
        self.assertNotIn(
            "certifications.certificate.evidenceDocumentPath", keys
        )
        self.assertEqual(
            "SENSITIVE_CONFIRMATION",
            policies["military.military.militaryStatus"],
        )
        self.assertEqual(
            {"$ref": "#/components/schemas/ProfileFieldKey"},
            schemas["MatchedFieldAnalysis"]["properties"]["profileFieldKey"],
        )
        self.assertEqual(
            {"$ref": "#/components/schemas/ProfileFieldKey"},
            schemas["LlmMatchedResult"]["properties"]["profileFieldKey"],
        )
        self.assertEqual(
            ["ADAPTER_VERIFIED", "LLM_SUGGESTED"],
            schemas["MatchedFieldAnalysis"]["properties"]["mappingStatus"][
                "enum"
            ],
        )
        self.assertNotIn(
            "profileFieldKey", schemas["NoMatchFieldAnalysis"]["properties"]
        )

    def test_field_analysis_rejects_flat_key_rule_status_and_invalid_no_match(
        self,
    ) -> None:
        validator = load_validator()
        document = yaml.safe_load(
            (
                REPOSITORY_ROOT
                / "llm-wiki/raw/issues/CF-44/documents/api/application-form-analysis.openapi.yaml"
            ).read_text(encoding="utf-8")
        )
        schema = document["components"]["schemas"]["FieldAnalysis"]
        valid_match = {
            "candidateId": "field-1",
            "matchType": "MATCH",
            "profileFieldKey": "certifications.certificate.name",
            "autofillPolicy": "CONDITIONAL",
            "mappingStatus": "LLM_SUGGESTED",
            "interactionStatus": "READY",
            "writePlan": {"command": "SET_TEXT"},
        }
        valid_no_match = {
            "candidateId": "field-1",
            "matchType": "NO_MATCH",
            "mappingStatus": "LLM_SUGGESTED",
            "interactionStatus": "BLOCKED",
            "reasonCodes": ["NO_MATCH"],
        }
        self.assertEqual(
            [], validator._validate_schema(valid_match, schema, document, "field")
        )
        self.assertEqual(
            [],
            validator._validate_schema(valid_no_match, schema, document, "field"),
        )

        invalid_results = (
            {**valid_match, "profileFieldKey": "startDate"},
            {**valid_match, "mappingStatus": "RULE_MATCHED"},
            {
                **valid_no_match,
                "profileFieldKey": "certifications.certificate.name",
            },
        )
        for result in invalid_results:
            with self.subTest(result=result):
                self.assertTrue(
                    validator._validate_schema(result, schema, document, "field")
                )

    def test_repository_profile_field_allowlist_matches_ui_and_product_policy(
        self,
    ) -> None:
        validator = load_validator()
        audit = getattr(validator, "profile_field_contract_errors", None)
        self.assertIsNotNone(audit)
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        document = yaml.safe_load(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(
                encoding="utf-8"
            )
        )

        self.assertEqual(
            [],
            audit(
                document,
                REPOSITORY_ROOT / "frontend/src/profile/field-definitions.ts",
                REPOSITORY_ROOT
                / "llm-wiki/raw/issues/CF-41/documents/docs/PROFILE_FIELDS.md",
            ),
        )

    def test_profile_field_audit_rejects_missing_extra_and_wrong_policy(
        self,
    ) -> None:
        validator = load_validator()
        audit = getattr(validator, "profile_field_contract_errors", None)
        self.assertIsNotNone(audit)
        document = yaml.safe_load(
            (
                REPOSITORY_ROOT
                / "llm-wiki/raw/issues/CF-44/documents/api/application-form-analysis.openapi.yaml"
            ).read_text(encoding="utf-8")
        )
        schema = document["components"]["schemas"].get("ProfileFieldKey")
        self.assertIsNotNone(schema)
        schema["enum"].remove("certifications.certificate.name")
        schema["enum"].append("certifications.certificate.unknown")
        schema["x-autofill-policies"]["personal.personal.koreanFamilyName"] = (
            "SENSITIVE_CONFIRMATION"
        )

        errors = audit(
            document,
            REPOSITORY_ROOT / "frontend/src/profile/field-definitions.ts",
            REPOSITORY_ROOT
            / "llm-wiki/raw/issues/CF-41/documents/docs/PROFILE_FIELDS.md",
        )

        self.assertTrue(any("누락" in error for error in errors))
        self.assertTrue(any("허용되지 않은 key" in error for error in errors))
        self.assertTrue(any("policy 불일치" in error for error in errors))

    def test_repository_defines_minimal_llm_input_and_discriminated_output(
        self,
    ) -> None:
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        document = yaml.safe_load(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(
                encoding="utf-8"
            )
        )
        schemas = document["components"]["schemas"]
        llm_input = schemas.get("LlmMappingInput")
        result = schemas.get("LlmMappingResult")
        self.assertIsNotNone(llm_input)
        self.assertIsNotNone(result)
        self.assertNotIn("site", llm_input["properties"])
        self.assertEqual("matchType", result["discriminator"]["propertyName"])
        self.assertEqual(
            {
                "candidateId",
                "displayName",
                "element",
                "control",
                "options",
            },
            set(schemas["LlmFieldCandidate"]["properties"]),
        )

    def test_llm_schema_rejects_browser_and_profile_only_data(self) -> None:
        validator = load_validator()
        document = yaml.safe_load(
            (
                REPOSITORY_ROOT
                / "llm-wiki/raw/issues/CF-44/documents/api/application-form-analysis.openapi.yaml"
            ).read_text(encoding="utf-8")
        )
        schemas = document["components"]["schemas"]
        candidate = {
            "candidateId": "field-1",
            "element": "input",
            "control": "text",
            "displayName": "합성 필드",
        }
        forbidden_candidate_properties = (
            "value",
            "profileValue",
            "visibility",
            "domName",
            "selector",
            "actionCandidates",
        )
        for property_name in forbidden_candidate_properties:
            with self.subTest(property_name=property_name):
                errors = validator._validate_schema(
                    {**candidate, property_name: "synthetic"},
                    schemas["LlmFieldCandidate"],
                    document,
                    "candidate",
                )
                self.assertTrue(any("unknown property" in error for error in errors))

        llm_input = {
            "schemaVersion": 2,
            "snapshotId": "snapshot-1",
            "sections": [{"sectionId": "root", "fields": [candidate]}],
            "site": {"host": "example.test"},
        }
        errors = validator._validate_schema(
            llm_input, schemas["LlmMappingInput"], document, "llm input"
        )
        self.assertTrue(any("unknown property: site" in error for error in errors))

    def test_llm_output_candidate_ids_exactly_match_input(self) -> None:
        validator = load_validator()
        relationship_errors = getattr(validator, "_llm_relationship_errors", None)
        self.assertIsNotNone(relationship_errors)
        llm_input = {
            "sections": [
                {
                    "sectionId": "qualification",
                    "fields": [{"candidateId": "field-1"}],
                    "items": [
                        {
                            "itemId": "item-1",
                            "fields": [{"candidateId": "field-2"}],
                        }
                    ],
                }
            ]
        }
        valid_results = [
            {"candidateId": "field-1", "matchType": "NO_MATCH"},
            {"candidateId": "field-2", "matchType": "NO_MATCH"},
        ]
        self.assertEqual(
            [], relationship_errors(llm_input, {"results": valid_results}, "llm")
        )

        invalid_outputs = (
            {"results": valid_results[:1]},
            {"results": [valid_results[0], valid_results[0]]},
            {
                "results": valid_results
                + [{"candidateId": "field-3", "matchType": "NO_MATCH"}]
            },
        )
        for output in invalid_outputs:
            with self.subTest(output=output):
                self.assertTrue(relationship_errors(llm_input, output, "llm"))

    def test_llm_input_candidate_ids_exactly_match_fields_request(self) -> None:
        validator = load_validator()
        relationship_errors = getattr(
            validator, "_llm_input_relationship_errors", None
        )
        self.assertIsNotNone(relationship_errors)
        fields_request = {
            "sections": [
                {
                    "sectionId": "qualification",
                    "fields": [{"candidateId": "field-1"}],
                    "items": [
                        {
                            "itemId": "item-1",
                            "fields": [{"candidateId": "field-2"}],
                        }
                    ],
                }
            ]
        }
        complete_input = {
            "sections": [
                {
                    "sectionId": "qualification",
                    "fields": [{"candidateId": "field-1"}],
                    "items": [
                        {
                            "itemId": "item-1",
                            "fields": [{"candidateId": "field-2"}],
                        }
                    ],
                }
            ]
        }
        self.assertEqual(
            [], relationship_errors(fields_request, complete_input, "llm input")
        )

        incomplete_input = {
            "sections": [
                {
                    "sectionId": "qualification",
                    "fields": [{"candidateId": "field-1"}],
                }
            ]
        }
        errors = relationship_errors(
            fields_request, incomplete_input, "llm input"
        )

        self.assertTrue(any("누락" in error for error in errors))

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
            '      "expectedEffect": "GROUP_COUNT_INCREMENT"'
        )
        self.assertIn(valid_plan, reference)
        reference = reference.replace(
            valid_plan,
            '"command": "REVEAL_SECTION",\n'
            '      "expectedEffect": "TARGET_VISIBLE",\n'
            '      "maxExecutions": 2,\n'
            '      "targetSectionId": "section-root"',
            1,
        )
        self.reference_path.write_text(reference, encoding="utf-8")

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("oneOf" in error for error in errors))

    def test_repository_rejects_reveal_target_section_not_in_request(self) -> None:
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
            '      "expectedEffect": "GROUP_COUNT_INCREMENT"'
        )
        self.assertIn(valid_plan, reference)
        reference = reference.replace(
            valid_plan,
            '"command": "REVEAL_SECTION",\n'
            '      "expectedEffect": "TARGET_VISIBLE",\n'
            '      "targetSectionId": "missing-section"',
            1,
        )
        self.reference_path.write_text(reference, encoding="utf-8")

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("targetSectionId가 요청에 없습니다" in error for error in errors))

    def test_repository_preparation_plans_omit_execution_count(self) -> None:
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        document = yaml.safe_load(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(encoding="utf-8")
        )

        for name in ("RevealSectionPlan", "AddRepeatableGroupPlan"):
            schema = document["components"]["schemas"][name]
            self.assertNotIn("maxExecutions", schema["required"])
            self.assertNotIn("maxExecutions", schema["properties"])

    def test_repository_repeatable_group_example_omits_execution_count(self) -> None:
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
            },
            response["preparationPlans"][0],
        )

    def test_repository_groups_repeatable_records_into_items(self) -> None:
        validator = load_validator()
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        document = yaml.safe_load(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(
                encoding="utf-8"
            )
        )
        schemas = document["components"]["schemas"]

        self.assertEqual(
            {"$ref": "#/components/schemas/PreparationItem"},
            schemas["PreparationSection"]["properties"]["items"]["items"],
        )
        self.assertEqual(
            {"$ref": "#/components/schemas/FieldsItem"},
            schemas["FieldsSection"]["properties"]["items"]["items"],
        )
        self.assertEqual(
            ["itemId", "fields"], schemas["FieldsItem"]["required"]
        )

        examples = validator._examples(raw_root / "application-form-analysis-api.md")
        request = next(example for kind, example in examples if kind == "fields-request")
        qualification = next(
            section
            for section in request["sections"]
            if section["sectionId"] == "section-qualification"
        )

        self.assertEqual([], qualification["fields"])
        self.assertEqual(
            ["qualification-item-01", "qualification-item-02"],
            [item["itemId"] for item in qualification["items"]],
        )
        self.assertTrue(all(item["fields"] for item in qualification["items"]))

    def test_rejects_duplicate_nested_item_and_candidate_ids(self) -> None:
        validator = load_validator()
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        self.openapi_path.write_text(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(
                encoding="utf-8"
            ),
            encoding="utf-8",
        )
        reference = (raw_root / "application-form-analysis-api.md").read_text(
            encoding="utf-8"
        )
        self.assertIn('"itemId": "qualification-item-02"', reference)
        self.assertIn('"candidateId": "field-certificate-name-02"', reference)
        reference = reference.replace(
            '"itemId": "qualification-item-02"',
            '"itemId": "qualification-item-01"',
            1,
        ).replace(
            '"candidateId": "field-certificate-name-02"',
            '"candidateId": "field-certificate-name-01"',
            1,
        )
        self.reference_path.write_text(reference, encoding="utf-8")

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("duplicate itemId" in error for error in errors))
        self.assertTrue(any("duplicate candidateId" in error for error in errors))

    def test_repository_rejects_execution_count_in_preparation_response(self) -> None:
        validator = load_validator()
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-44/documents/api"
        self.openapi_path.write_text(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        reference = (raw_root / "application-form-analysis-api.md").read_text(
            encoding="utf-8"
        )
        valid_effect = '"expectedEffect": "GROUP_COUNT_INCREMENT"'
        self.assertIn(valid_effect, reference)
        self.reference_path.write_text(
            reference.replace(valid_effect, f'{valid_effect},\n      "maxExecutions": 3', 1),
            encoding="utf-8",
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("oneOf" in error for error in errors))

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


if __name__ == "__main__":
    unittest.main()
