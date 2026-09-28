import unittest

from harness.lib.live_autofill_evaluation import (
    CandidateState,
    EvaluationError,
    EvaluationState,
    advance,
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
        state = EvaluationState("READY_TO_WRITE", frozenset())

        written = advance(
            state,
            "WRITE",
            tab_id="tab-1",
            current_run_approved=True,
        )

        self.assertEqual(
            EvaluationState("DOM_VERIFY", frozenset(("tab-1",))),
            written,
        )
        self.assertEqual(
            EvaluationState("REPORTED", frozenset(("tab-1",))),
            advance(written, "DOM_VERIFIED", tab_id="tab-1"),
        )

    def test_resumes_written_tab_with_dom_verification_without_second_write(self) -> None:
        state = EvaluationState("READY_TO_WRITE", frozenset(("tab-1",)))

        self.assertEqual(
            EvaluationState("DOM_VERIFY", frozenset(("tab-1",))),
            advance(state, "RESUME", tab_id="tab-1"),
        )

    def test_rejects_unknown_candidate_status_and_invalid_transition(self) -> None:
        with self.assertRaisesRegex(EvaluationError, "후보 상태"):
            CandidateState("candidate-1", "unknown")

        with self.assertRaisesRegex(EvaluationError, "전환"):
            advance(EvaluationState("PRECHECK", frozenset()), "DOM_VERIFIED")


if __name__ == "__main__":
    unittest.main()
