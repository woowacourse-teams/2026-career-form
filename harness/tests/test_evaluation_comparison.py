import copy
import unittest

from harness.lib.evaluation_comparison import revision_comparison
from harness.lib.evaluation_revision import RevisionError
from harness.lib.generic_autofill_eval import evaluate_generic_autofill
from harness.tests.test_generic_autofill_eval import ground_truth, observations
from harness.tests.test_evaluation_revision import revision_evidence


class RevisionComparisonTest(unittest.TestCase):
    def test_distinct_verified_revisions_are_comparable(self):
        previous = evaluate_generic_autofill(ground_truth(), observations())["sources"]["LIVE_SITE"]
        payload = observations()
        for run in payload["runs"]:
            run.update(revision="b" * 40,
                       revision_evidence=revision_evidence(run["source"], "b" * 40))
        current = evaluate_generic_autofill(ground_truth(), payload)["sources"]["LIVE_SITE"]
        self.assertEqual("COMPARABLE", revision_comparison(current, previous, "LIVE_SITE")["status"])

    def test_forged_previous_metadata_is_rejected(self):
        current = evaluate_generic_autofill(ground_truth(), observations())["sources"]["LIVE_SITE"]
        previous = copy.deepcopy(current)
        previous["sites"]["alpha"]["revision_evidence"]["metadata_sha256"] = "0" * 64
        with self.assertRaises(RevisionError):
            revision_comparison(current, previous, "LIVE_SITE")

    def test_inconclusive_measurements_do_not_prove_revision_regressions(self):
        previous = evaluate_generic_autofill(ground_truth(), observations())["sources"]["LIVE_SITE"]
        payload = observations()
        payload["runs"][0].update(
            status="INCONCLUSIVE", candidates=[], inconclusive_reason="FORM_CLOSED"
        )
        current = evaluate_generic_autofill(ground_truth(), payload)["sources"]["LIVE_SITE"]
        result = revision_comparison(current, previous, "LIVE_SITE")
        self.assertEqual("HELD", result["status"])
        self.assertIn("INCONCLUSIVE_SITE", result["reasons"])
