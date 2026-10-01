import copy

import yaml

from scripts.tests.application_form_api_validator_fixture import (
    REPOSITORY_ROOT,
    load_validator,
)


class ApplicationFormApiCurrentCases:
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
            '"revealSections": []',
            '"revealSections": '
            '[{"candidateId": "action-1", "targetSectionId": "root"}]',
        )
        self._replace_after(
            "<!-- llm-example: action-output -->",
            '"noActions": [{"candidateId": "action-1"}]',
            '"noActions": []',
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

    def test_current_fields_request_allows_producer_owned_relationship_ids(self) -> None:
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
                    "items": [{"itemId": "item-1", "fields": []}],
                },
                {
                    "sectionId": "section-b",
                    "parentSectionId": "section-a",
                    "fields": [],
                    "items": [{"itemId": "item-1", "fields": []}],
                },
                {"sectionId": "section-b", "fields": []},
            ]
        }

        errors = validator._request_relationship_errors(request, "request")

        self.assertEqual([], errors)

    def test_current_contract_uses_relaxed_fields_relationship_policy(self) -> None:
        validator = load_validator()
        self._use_successor_contract()
        self._replace_after(
            "<!-- api-example: fields-request -->",
            '"sectionId": "education"',
            '"sectionId": "root", "parentSectionId": "missing"',
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertEqual([], errors)

    def test_current_request_still_rejects_duplicate_candidate_id(self) -> None:
        validator = load_validator()
        request = {
            "sections": [
                {
                    "sectionId": "section-a",
                    "fields": [{"candidateId": "field-1"}],
                },
                {
                    "sectionId": "section-a",
                    "fields": [{"candidateId": "field-1"}],
                },
            ]
        }

        errors = validator._request_relationship_errors(request, "request")

        self.assertEqual(1, len(errors), errors)
        self.assertIn("duplicate candidateId", errors[0])

    def test_current_preparation_request_rejects_duplicate_section_id(self) -> None:
        validator = load_validator()
        request = {
            "sections": [
                {"sectionId": "section-a", "actionCandidates": []},
                {"sectionId": "section-a", "actionCandidates": []},
            ]
        }

        errors = validator._request_relationship_errors(request, "request")

        self.assertTrue(any("duplicate sectionId" in error for error in errors), errors)

    def test_rejects_llm_schema_and_snapshot_header_mismatch(self) -> None:
        validator = load_validator()
        source = {"schemaVersion": 2, "snapshotId": "snapshot-1", "sections": []}
        field_result = {
            "schemaVersion": 1,
            "snapshotId": "snapshot-2",
            "matches": [],
            "noMatches": [],
        }
        action_result = {
            "schemaVersion": 1,
            "snapshotId": "snapshot-2",
            "revealSections": [],
            "addRepeatableGroups": [],
            "noActions": [],
        }

        field_errors = validator._llm_relationship_errors(
            source,
            field_result,
            "field",
        )
        action_errors = validator._llm_action_output_relationship_errors(
            source,
            action_result,
            "action",
        )

        for errors in (field_errors, action_errors):
            self.assertTrue(any("schemaVersion" in error for error in errors))
            self.assertTrue(any("snapshotId" in error for error in errors))

    def test_rejects_field_output_candidate_mismatch_across_buckets(self) -> None:
        validator = load_validator()
        self._use_successor_contract()
        self._replace_after(
            "<!-- llm-example: mapping-output -->",
            '"candidateId": "field-2"',
            '"candidateId": "unknown-field"',
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(any("missing candidateId: field-2" in error for error in errors))
        self.assertTrue(any("unknown candidateId: unknown-field" in error for error in errors))

    def test_current_request_accepts_explicit_null_for_optional_property(self) -> None:
        validator = load_validator()
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-40/documents/api"
        self.openapi_path.write_text(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(
                encoding="utf-8"
            ),
            encoding="utf-8",
        )
        reference = (raw_root / "application-form-analysis-api.md").read_text(
            encoding="utf-8"
        )
        self.assertIn('"displayName": "지원서"', reference)
        self.reference_path.write_text(
            reference.replace('"displayName": "지원서"', '"displayName": null', 1),
            encoding="utf-8",
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertEqual([], errors)

    def test_current_relationships_treat_optional_null_arrays_as_omitted(self) -> None:
        validator = load_validator()
        request = {
            "sections": [
                {
                    "sectionId": "section-a",
                    "fields": [
                        {
                            "candidateId": "field-1",
                            "options": None,
                        }
                    ],
                    "items": None,
                }
            ]
        }

        try:
            errors = validator._request_relationship_errors(request, "request")
        except TypeError as error:
            self.fail(f"optional null 배열을 순회하면 안 됩니다: {error}")

        self.assertEqual([], errors)

    def test_current_schema_accepts_null_for_optional_request_properties(self) -> None:
        validator = load_validator()
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-40/documents/api"
        document = yaml.safe_load(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(
                encoding="utf-8"
            )
        )
        schemas = document["components"]["schemas"]
        cases = (
            (
                "PreparationSection",
                {
                    "sectionId": "section-a",
                    "parentSectionId": None,
                    "displayName": None,
                    "actionCandidates": [],
                    "items": None,
                },
            ),
            (
                "FieldsSection",
                {
                    "sectionId": "section-a",
                    "parentSectionId": None,
                    "displayName": None,
                    "fields": [],
                    "items": None,
                },
            ),
            (
                "ActionCandidate",
                {
                    "candidateId": "action-1",
                    "element": "button",
                    "control": "button",
                    "visibility": "visible",
                    "displayName": None,
                    "domId": None,
                    "domName": None,
                    "disabled": None,
                    "readonly": None,
                    "inert": None,
                },
            ),
            (
                "FieldCandidate",
                {
                    "candidateId": "field-1",
                    "element": "input",
                    "control": "text",
                    "visibility": "visible",
                    "displayName": None,
                    "domId": None,
                    "domName": None,
                    "placeholder": None,
                    "disabled": None,
                    "readonly": None,
                    "inert": None,
                    "options": None,
                },
            ),
        )

        for schema_name, value in cases:
            with self.subTest(schema=schema_name):
                self.assertEqual(
                    [],
                    validator._validate_schema(
                        value,
                        schemas[schema_name],
                        document,
                        schema_name,
                    ),
                )

    def test_current_schema_rejects_null_for_required_request_arrays(self) -> None:
        validator = load_validator()
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-40/documents/api"
        document = yaml.safe_load(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(
                encoding="utf-8"
            )
        )
        schemas = document["components"]["schemas"]
        cases = (
            (
                "PreparationSection",
                {"sectionId": "section-a", "actionCandidates": None},
            ),
            (
                "FieldsSection",
                {"sectionId": "section-a", "fields": None},
            ),
        )

        for schema_name, value in cases:
            with self.subTest(schema=schema_name):
                errors = validator._validate_schema(
                    value,
                    schemas[schema_name],
                    document,
                    schema_name,
                )
                self.assertTrue(errors, value)

    def test_current_request_rejects_explicit_null_for_required_property(self) -> None:
        validator = load_validator()
        raw_root = REPOSITORY_ROOT / "llm-wiki/raw/issues/CF-40/documents/api"
        self.openapi_path.write_text(
            (raw_root / "application-form-analysis.openapi.yaml").read_text(
                encoding="utf-8"
            ),
            encoding="utf-8",
        )
        reference = (raw_root / "application-form-analysis-api.md").read_text(
            encoding="utf-8"
        )
        self.assertIn('"snapshotId": "synthetic-preparation-v2"', reference)
        self.reference_path.write_text(
            reference.replace(
                '"snapshotId": "synthetic-preparation-v2"',
                '"snapshotId": null',
                1,
            ),
            encoding="utf-8",
        )

        errors = validator.validate_contract(self.openapi_path, self.reference_path)

        self.assertTrue(
            any("snapshotId: string 타입이 아닙니다" in error for error in errors),
            errors,
        )

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

    def test_accepts_current_statuses_without_snapshot_byte_limit(self) -> None:
        validator = load_validator()
        current_errors = getattr(validator, "_current_contract_errors", None)
        self.assertIsNotNone(current_errors)
        valid = self._current_contract_document()

        self.assertEqual([], current_errors(valid))

    def test_rejects_current_status_and_error_code_drift(self) -> None:
        validator = load_validator()
        current_errors = getattr(validator, "_current_contract_errors", None)
        self.assertIsNotNone(current_errors)
        valid = self._current_contract_document()

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
        with_413 = copy.deepcopy(valid)
        with_413["paths"]["/api/v1/fields/analyze"]["post"]["responses"][
            "413"
        ] = {"description": "removed contract"}
        mutations.append(with_413)
        with_snapshot_limits = copy.deepcopy(valid)
        with_snapshot_limits["x-snapshot-byte-limits"] = {
            "raw": 65_536,
            "canonical": 65_536,
        }
        mutations.append(with_snapshot_limits)
        with_snapshot_too_large_schema = copy.deepcopy(valid)
        with_snapshot_too_large_schema["components"]["schemas"][
            "SnapshotTooLargeError"
        ] = {
            "type": "object",
            "additionalProperties": False,
            "required": ["code", "message"],
            "properties": {
                "code": {"type": "string", "const": "SNAPSHOT_TOO_LARGE"},
                "message": {"type": "string"},
            },
        }
        with_snapshot_too_large_schema["components"]["responses"][
            "SnapshotTooLarge"
        ] = {
            "description": "removed contract",
            "content": {
                "application/json": {
                    "schema": {
                        "$ref": "#/components/schemas/SnapshotTooLargeError"
                    }
                }
            },
        }
        mutations.append(with_snapshot_too_large_schema)
        with_renamed_snapshot_too_large_schema = copy.deepcopy(valid)
        with_renamed_snapshot_too_large_schema["components"]["schemas"][
            "RemovedError"
        ] = {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "code": {"type": "string", "const": "SNAPSHOT_TOO_LARGE"},
            },
        }
        mutations.append(with_renamed_snapshot_too_large_schema)
        wrong_code = copy.deepcopy(valid)
        wrong_code["components"]["schemas"]["InternalError"]["properties"][
            "code"
        ]["const"] = "WRONG"
        mutations.append(wrong_code)

        for mutation in mutations:
            with self.subTest(mutation=mutation):
                self.assertTrue(current_errors(mutation))
