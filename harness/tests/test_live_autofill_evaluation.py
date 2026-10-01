import unittest

from harness.lib.live_autofill_evaluation import (
    CandidateState,
    EvaluationError,
    EvaluationState,
    PregradedField,
    PregradedSite,
    ReportMetadata,
    ReportRecord,
    SiteEvaluationResult,
    advance,
    build_site_report,
    deferred_candidate_ids,
    write_candidate_ids,
)


class LiveAutofillEvaluationTest(unittest.TestCase):
    def test_selects_non_sensitive_conflicts_without_retaining_values(self) -> None:
        candidates = (
            CandidateState("candidate-1", "available"),
            CandidateState("candidate-2", "conflict"),
            CandidateState("candidate-3", "needs-review"),
            CandidateState("candidate-4", "sensitive"),
            CandidateState("candidate-5", "unavailable"),
        )

        self.assertEqual(
            ("candidate-1", "candidate-2", "candidate-3"),
            write_candidate_ids(candidates),
        )
        self.assertEqual(
            ("candidate-4", "candidate-5"),
            deferred_candidate_ids(candidates),
        )

    def test_rejects_write_without_current_run_consent(self) -> None:
        state = EvaluationState("READY_TO_WRITE", frozenset())

        with self.assertRaisesRegex(EvaluationError, "승인"):
            advance(state, "WRITE", tab_id="tab-1")

    def test_writes_once_then_requires_dom_verification(self) -> None:
        state = EvaluationState(
            "READY_TO_WRITE",
            frozenset(),
            frozenset(("public-site",)),
        )

        written = advance(
            state,
            "WRITE",
            tab_id="tab-1",
            current_run_approved=True,
        )

        self.assertEqual(
            EvaluationState(
                "DOM_VERIFY",
                frozenset(("tab-1",)),
                frozenset(("public-site",)),
            ),
            written,
        )
        self.assertEqual(
            EvaluationState(
                "REPORTING",
                frozenset(("tab-1",)),
                frozenset(("public-site",)),
            ),
            advance(written, "DOM_VERIFIED", tab_id="tab-1"),
        )

    def test_requires_sanitized_report_after_dom_verification(self) -> None:
        state = EvaluationState(
            "REPORTING",
            frozenset(("tab-1",)),
            frozenset(("public-site",)),
        )

        with self.assertRaisesRegex(EvaluationError, "보고서"):
            advance(state, "REPORT_RECORDED")

        record = ReportRecord(
            report_id="cf-124-2026-09-28",
            site_ids=frozenset(("public-site",)),
            knowledge_approval_digest="a" * 64,
            wiki_validated=True,
        )
        self.assertEqual(
            EvaluationState(
                "REPORTED",
                frozenset(("tab-1",)),
                frozenset(("public-site",)),
            ),
            advance(state, "REPORT_RECORDED", report_record=record),
        )

        with self.assertRaisesRegex(EvaluationError, "Wiki"):
            advance(
                state,
                "REPORT_RECORDED",
                report_record=ReportRecord(
                    report_id="cf-124-2026-09-28",
                    site_ids=frozenset(("public-site",)),
                    knowledge_approval_digest="a" * 64,
                    wiki_validated=False,
                ),
            )

        with self.assertRaisesRegex(EvaluationError, "사이트"):
            advance(
                state,
                "REPORT_RECORDED",
                report_record=ReportRecord(
                    report_id="cf-124-2026-09-28",
                    site_ids=frozenset(("different-site",)),
                    knowledge_approval_digest="a" * 64,
                    wiki_validated=True,
                ),
            )

    def test_rejects_dom_verification_for_an_unwritten_tab(self) -> None:
        state = EvaluationState("DOM_VERIFY", frozenset(("tab-1",)))

        with self.assertRaisesRegex(EvaluationError, "쓴 탭"):
            advance(state, "DOM_VERIFIED", tab_id="tab-2")

    def test_resumes_written_tab_with_dom_verification_without_second_write(self) -> None:
        state = EvaluationState("READY_TO_WRITE", frozenset(("tab-1",)))

        self.assertEqual(
            EvaluationState("DOM_VERIFY", frozenset(("tab-1",))),
            advance(state, "RESUME", tab_id="tab-1"),
        )

    def test_rejects_unknown_candidate_status_and_invalid_transition(self) -> None:
        with self.assertRaisesRegex(EvaluationError, "candidate_id"):
            CandidateState("", "available")

        with self.assertRaisesRegex(EvaluationError, "후보 상태"):
            CandidateState("candidate-1", "unknown")

        with self.assertRaisesRegex(EvaluationError, "평가 단계"):
            EvaluationState("UNKNOWN", frozenset())

        with self.assertRaisesRegex(EvaluationError, "tab_id"):
            EvaluationState("PRECHECK", frozenset(("",)))

        with self.assertRaisesRegex(EvaluationError, "전환"):
            advance(EvaluationState("PRECHECK", frozenset()), "DOM_VERIFIED")

    def test_advances_precheck_and_pregrading_then_can_block(self) -> None:
        pregrading = advance(
            EvaluationState("PRECHECK", frozenset()),
            "PRECHECK_COMPLETED",
        )
        ready = advance(
            pregrading,
            "PREGRADING_COMPLETED",
            pregraded_sites=(self._pregraded_site(),),
        )

        self.assertEqual(EvaluationState("PREGRADING", frozenset()), pregrading)
        self.assertEqual(
            EvaluationState(
                "READY_TO_WRITE",
                frozenset(),
                frozenset(("public-site",)),
            ),
            ready,
        )
        self.assertEqual(
            EvaluationState(
                "BLOCKED",
                frozenset(),
                frozenset(("public-site",)),
            ),
            advance(ready, "BLOCK"),
        )

    def test_requires_evaluation_agent_pregrading_before_extension_write(self) -> None:
        state = EvaluationState("PREGRADING", frozenset())

        with self.assertRaisesRegex(EvaluationError, "사전 판정"):
            advance(state, "PREGRADING_COMPLETED")

        with self.assertRaisesRegex(EvaluationError, "evaluation-agent"):
            PregradedSite(
                site_id="public-site",
                fields=self._pregraded_site().fields,
                ground_truth_creator="product-ai",
                human_reviewed=False,
            )

    def test_freezes_full_page_autofillable_denominator(self) -> None:
        site = self._pregraded_site()

        self.assertEqual(6, site.total_field_count)
        self.assertEqual(2, site.autofillable_count)
        self.assertEqual("evaluation-agent", site.ground_truth_creator)
        self.assertFalse(site.human_reviewed)

        with self.assertRaisesRegex(EvaluationError, "중복"):
            PregradedSite(
                site_id="public-site",
                fields=(site.fields[0], site.fields[0]),
                ground_truth_creator="evaluation-agent",
                human_reviewed=False,
            )

        with self.assertRaisesRegex(EvaluationError, "site_id"):
            PregradedSite(
                site_id="https://example.com/jobs/secret",
                fields=site.fields,
                ground_truth_creator="evaluation-agent",
                human_reviewed=False,
            )

        with self.assertRaisesRegex(EvaluationError, "분류"):
            PregradedField("field-7", "UNKNOWN")

    def test_reports_precision_and_denominator_based_coverage(self) -> None:
        site = PregradedSite(
            site_id="public-site",
            fields=tuple(
                PregradedField(f"field-{index}", "AUTOFILLABLE")
                for index in range(1, 11)
            ),
            ground_truth_creator="evaluation-agent",
            human_reviewed=False,
        )
        result = SiteEvaluationResult(
            discovered_count=5,
            proposed_count=5,
            correct_mapping_count=4,
            correct_bound_count=4,
            written_count=4,
            retained_count=4,
            deferred_count=1,
            failed_count=1,
            incorrect_write_count=0,
        )
        metadata = ReportMetadata(
            product_revision="unknown-installed-build",
            product_revision_status="UNVERIFIED",
            contract_version="1.0",
            profile_mode="EXISTING_PROFILE",
            profile_version="profile-export-example-v1",
        )

        report = build_site_report(site, result, metadata)

        self.assertEqual(
            {"numerator": 4, "denominator": 5, "rate": 0.8},
            report["metrics"]["mapping_precision"],
        )
        self.assertEqual(
            {"numerator": 4, "denominator": 10, "rate": 0.4},
            report["metrics"]["mapping_recall"],
        )
        self.assertEqual(
            {"numerator": 4, "denominator": 10, "rate": 0.4},
            report["metrics"]["correct_input_rate"],
        )
        self.assertEqual("public-site", report["site_id"])
        self.assertEqual("evaluation-agent", report["ground_truth_creator"])
        self.assertEqual(
            {
                "AUTOFILLABLE": 10,
                "CONDITIONAL": 0,
                "PROFILE_VALUE_MISSING": 0,
                "FORBIDDEN": 0,
                "CREATED_AFTER_ACTION": 0,
            },
            report["classification_counts"],
        )
        self.assertEqual(5, report["stage_counts"]["DISCOVERED"])
        self.assertEqual(1, report["stage_counts"]["DEFERRED"])
        self.assertEqual(1, report["stage_counts"]["FAILED"])
        self.assertNotIn("fields", report)

    @staticmethod
    def _pregraded_site() -> PregradedSite:
        return PregradedSite(
            site_id="public-site",
            fields=(
                PregradedField("field-1", "AUTOFILLABLE"),
                PregradedField("field-2", "AUTOFILLABLE"),
                PregradedField("field-3", "CONDITIONAL"),
                PregradedField("field-4", "PROFILE_VALUE_MISSING"),
                PregradedField("field-5", "FORBIDDEN"),
                PregradedField("field-6", "CREATED_AFTER_ACTION"),
            ),
            ground_truth_creator="evaluation-agent",
            human_reviewed=False,
        )

    def test_rejects_duplicate_write_and_resume_without_written_tab(self) -> None:
        with self.assertRaisesRegex(EvaluationError, "이미 쓴 탭"):
            advance(
                EvaluationState(
                    "READY_TO_WRITE",
                    frozenset(("tab-1",)),
                    frozenset(("public-site",)),
                ),
                "WRITE",
                tab_id="tab-1",
                current_run_approved=True,
            )

        with self.assertRaisesRegex(EvaluationError, "재개할 쓴 탭"):
            advance(
                EvaluationState("READY_TO_WRITE", frozenset()),
                "RESUME",
                tab_id="tab-1",
            )


if __name__ == "__main__":
    unittest.main()
