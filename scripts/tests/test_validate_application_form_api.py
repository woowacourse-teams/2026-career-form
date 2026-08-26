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
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-40/documents/api"
        self.assertEqual(
            [],
            validator.validate_contract(
                raw_root / "application-form-analysis.openapi.yaml",
                raw_root / "application-form-analysis-api.md",
            ),
        )

    def test_legacy_cf44_raw_contract_still_passes(self) -> None:
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

        self.assertTrue(any("ProfileFieldKey 누락" in error for error in errors))
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

    def test_repository_declares_three_exclusive_field_analysis_routes(
        self,
    ) -> None:
        validator = load_validator()
        route_errors = getattr(validator, "_fields_response_route_errors", None)
        self.assertIsNotNone(route_errors)
        document = yaml.safe_load(
            (
                REPOSITORY_ROOT
                / "llm-wiki/raw/issues/CF-44/documents/api/application-form-analysis.openapi.yaml"
            ).read_text(encoding="utf-8")
        )
        routes = document["components"]["schemas"]["FieldsAnalyzeResponse"].get(
            "x-analysis-routes"
        )
        self.assertEqual(
            {
                "ADAPTER_VERIFIED",
                "ADAPTER_STRUCTURE_MISMATCH",
                "GENERIC_LLM",
            },
            set(routes or {}),
        )
        generic_field = {
            "candidateId": "field-1",
            "matchType": "MATCH",
            "profileFieldKey": "contact.contact.email",
            "autofillPolicy": "ALLOWED",
            "mappingStatus": "LLM_SUGGESTED",
            "interactionStatus": "READY",
        }
        generic = {
            "mode": "GENERIC",
            "analysisStatus": "COMPLETE",
            "fields": [generic_field],
        }
        self.assertEqual([], route_errors(generic, "fields response"))
        self.assertTrue(
            route_errors(
                {
                    **generic,
                    "fields": [
                        {**generic_field, "mappingStatus": "ADAPTER_VERIFIED"}
                    ],
                },
                "fields response",
            )
        )
        self.assertTrue(
            route_errors(
                {
                    "mode": "ADAPTER",
                    "analysisStatus": "BLOCKED",
                    "fields": [],
                },
                "fields response",
            )
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

        self.assertTrue(any("missing candidateId" in error for error in errors))

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

    def test_rejects_action_output_candidate_mismatch(self) -> None:
        validator = load_validator()
        self._use_successor_contract()
        self._replace_after(
            "<!-- llm-example: action-output -->",
            '"candidateId": "action-1"',
            '"candidateId": "unknown-action"',
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(
            any("missing candidateId" in error for error in errors), errors
        )
        self.assertTrue(
            any("unknown candidateId" in error for error in errors), errors
        )

    def test_rejects_action_on_ineligible_candidate(self) -> None:
        validator = load_validator()
        self._use_successor_contract()
        self._replace_after(
            "<!-- llm-example: action-input -->",
            '"visibility": "visible"',
            '"visibility": "hidden"',
        )
        self._replace_after(
            "<!-- llm-example: action-output -->",
            '{"candidateId": "action-1", "actionType": "NO_ACTION"}',
            '{"candidateId": "action-1", "actionType": "ACTION", '
            '"command": "REVEAL_SECTION", '
            '"expectedEffect": "TARGET_VISIBLE", '
            '"targetSectionId": "root"}',
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("실행 불가 candidate" in error for error in errors), errors)

    def test_rejects_partial_response_with_results(self) -> None:
        validator = load_validator()
        self._use_successor_contract()
        self._replace_after(
            "<!-- api-example: fields-response -->",
            '"snapshotId": "fields-b", "fields"',
            '"snapshotId": "fields-b", "analysisStatus": "PARTIAL", '
            '"warningCodes": ["LLM_UNAVAILABLE"], "fields"',
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(
            any("PARTIAL 결과는 비어 있어야 합니다" in error for error in errors),
            errors,
        )

    def test_enforces_max_length(self) -> None:
        validator = load_validator()
        self._use_successor_contract()
        document = yaml.safe_load(self.openapi_path.read_text(encoding="utf-8"))
        schema = document["components"]["schemas"]["PreparationRequest"][
            "properties"
        ]["snapshotId"]

        errors = validator._validate_schema(
            "x" * 129,
            schema,
            document,
            "snapshotId",
        )

        self.assertTrue(any("maxLength" in error for error in errors), errors)

    def test_valid_successor_action_and_field_examples_pass(self) -> None:
        validator = load_validator()
        self._use_successor_contract()

        self.assertEqual(
            [],
            validator.validate_contract(self.openapi_path, self.reference_path),
        )

    def test_rejects_action_input_candidate_mismatch(self) -> None:
        validator = load_validator()
        self._use_successor_contract()
        self._replace_after(
            "<!-- llm-example: action-input -->",
            '"candidateId": "action-1"',
            '"candidateId": "unknown-action"',
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("missing candidateId" in error for error in errors))
        self.assertTrue(any("unknown candidateId" in error for error in errors))

    def test_rejects_duplicate_section_option_and_parent_cycle(self) -> None:
        validator = load_validator()
        request = {
            "sections": [
                {
                    "sectionId": "section-a",
                    "parentSectionId": "section-b",
                    "fields": [
                        {
                            "candidateId": "field-1",
                            "options": [
                                {"optionId": "option-1"},
                                {"optionId": "option-1"},
                            ],
                        }
                    ],
                },
                {
                    "sectionId": "section-b",
                    "parentSectionId": "section-a",
                    "fields": [],
                },
                {"sectionId": "section-b", "fields": []},
            ]
        }

        errors = validator._request_relationship_errors(request, "request")

        self.assertTrue(any("duplicate sectionId" in error for error in errors))
        self.assertTrue(any("duplicate optionId" in error for error in errors))
        self.assertTrue(any("순환" in error for error in errors))

    def test_rejects_llm_schema_and_snapshot_header_mismatch(self) -> None:
        validator = load_validator()
        source = {"schemaVersion": 2, "snapshotId": "snapshot-1", "sections": []}
        result = {"schemaVersion": 1, "snapshotId": "snapshot-2", "results": []}

        field_errors = validator._llm_relationship_errors(source, result, "field")
        action_errors = validator._llm_action_output_relationship_errors(
            source,
            result,
            "action",
        )

        for errors in (field_errors, action_errors):
            self.assertTrue(any("schemaVersion" in error for error in errors))
            self.assertTrue(any("snapshotId" in error for error in errors))

    def test_requires_complete_field_candidate_exact_set(self) -> None:
        validator = load_validator()
        request = {
            "snapshotId": "snapshot-1",
            "sections": [
                {
                    "sectionId": "root",
                    "fields": [
                        {"candidateId": "field-1"},
                        {"candidateId": "field-2"},
                    ],
                }
            ],
        }
        response = {
            "snapshotId": "snapshot-1",
            "analysisStatus": "COMPLETE",
            "fields": [{"candidateId": "field-1"}],
        }

        errors = validator._response_relationship_errors(
            "fields-response",
            response,
            {("fields-request", "snapshot-1"): request},
            "response",
        )

        self.assertTrue(any("missing candidateId: field-2" in error for error in errors))

    def test_rejects_partial_warning_mismatch(self) -> None:
        validator = load_validator()

        errors = validator._partial_response_errors(
            "preparation-response",
            {
                "analysisStatus": "PARTIAL",
                "warningCodes": ["UNRESOLVED_FIELD"],
                "preparationPlans": [],
            },
            "response",
        )

        self.assertTrue(any("warningCodes" in error for error in errors))

    def test_enforces_field_interaction_policy_and_precedence(self) -> None:
        validator = load_validator()
        policy_errors = getattr(validator, "_field_analysis_errors", None)
        self.assertIsNotNone(policy_errors)
        request = {
            "sections": [
                {
                    "sectionId": "root",
                    "fields": [
                        {
                            "candidateId": "field-disabled-hidden",
                            "element": "input",
                            "control": "text",
                            "visibility": "hidden",
                            "disabled": True,
                        },
                        {
                            "candidateId": "field-text",
                            "element": "input",
                            "control": "text",
                            "visibility": "visible",
                        },
                    ],
                }
            ]
        }
        valid_response = {
            "analysisStatus": "COMPLETE",
            "fields": [
                {
                    "candidateId": "field-disabled-hidden",
                    "matchType": "MATCH",
                    "interactionStatus": "BLOCKED",
                },
                {
                    "candidateId": "field-text",
                    "matchType": "MATCH",
                    "interactionStatus": "READY",
                    "writePlan": {"command": "SET_TEXT"},
                },
            ],
        }
        self.assertEqual([], policy_errors(request, valid_response, "fields"))

        invalid = copy.deepcopy(valid_response)
        invalid["fields"][0]["interactionStatus"] = "MANUAL_REVEAL_REQUIRED"
        invalid["fields"][1]["writePlan"]["command"] = "SELECT_OPTION"

        errors = policy_errors(request, invalid, "fields")

        self.assertTrue(any("field-disabled-hidden" in error for error in errors))
        self.assertTrue(any("field-text" in error for error in errors))

    def test_rejects_current_status_byte_limit_and_error_code_drift(self) -> None:
        validator = load_validator()
        current_errors = getattr(validator, "_current_contract_errors", None)
        self.assertIsNotNone(current_errors)
        valid = self._current_contract_document()
        self.assertEqual([], current_errors(valid))

        mutations = []
        with_429 = copy.deepcopy(valid)
        with_429["paths"]["/api/v1/fields/analyze"]["post"]["responses"][
            "429"
        ] = {"description": "not implemented"}
        mutations.append(with_429)
        with_502 = copy.deepcopy(valid)
        with_502["paths"]["/api/v1/preparation/analyze"]["post"]["responses"][
            "502"
        ] = {"description": "not used"}
        mutations.append(with_502)
        wrong_limit = copy.deepcopy(valid)
        wrong_limit["x-snapshot-byte-limits"]["canonical"] = 65_535
        mutations.append(wrong_limit)
        wrong_code = copy.deepcopy(valid)
        wrong_code["components"]["schemas"]["InternalError"]["properties"][
            "code"
        ]["const"] = "WRONG"
        mutations.append(wrong_code)

        for mutation in mutations:
            with self.subTest(mutation=mutation):
                self.assertTrue(current_errors(mutation))

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


if __name__ == "__main__":
    unittest.main()
