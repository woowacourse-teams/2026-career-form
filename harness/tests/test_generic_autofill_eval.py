import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from harness.lib.generic_autofill_eval import (
    EvaluationError,
    evaluate_generic_autofill,
)
from harness.tests.test_evaluation_revision import revision_evidence, unavailable_evidence


def ground_truth() -> dict[str, object]:
    return {
        "contract_version": "1.1",
        "profile_version": "synthetic-v1",
        "sites": [
            {
                "site_id": "alpha",
                "fields": [
                    {
                        "field_id": "f001",
                        "classification": "AUTOFILLABLE",
                        "classification_reason": "PROFILE_VALUE_AVAILABLE",
                        "control_kind": "TEXT",
                    },
                    {
                        "field_id": "f002",
                        "classification": "AUTOFILLABLE",
                        "classification_reason": "PROFILE_VALUE_AVAILABLE",
                        "control_kind": "SELECT",
                    },
                    {
                        "field_id": "f003",
                        "classification": "FORBIDDEN",
                        "classification_reason": "SENSITIVE_FIELD",
                        "control_kind": "TEXT",
                    },
                ],
            },
            {
                "site_id": "beta",
                "fields": [
                    {
                        "field_id": "f001",
                        "classification": "AUTOFILLABLE",
                        "classification_reason": "PROFILE_VALUE_AVAILABLE",
                        "control_kind": "TEXT",
                    }
                ],
            },
        ],
    }


def candidate(
    candidate_id: str,
    field_id: str,
    stages: list[str],
    *,
    mapping_result: str | None,
    write_result: str | None = None,
    terminal_result: str | None = None,
    reason_code: str | None = None,
    existing_value_changed: bool = False,
) -> dict[str, object]:
    return {
        "candidate_id": candidate_id,
        "field_id": field_id,
        "stages": stages,
        "mapping_result": mapping_result,
        "write_result": write_result,
        "terminal_result": terminal_result,
        "reason_code": reason_code,
        "existing_value_changed": existing_value_changed,
    }


def measured_run(
    site_id: str,
    source: str,
    candidates: list[dict[str, object]],
    *,
    provider_calls: int = 1,
    input_tokens: int = 10,
    output_tokens: int = 5,
    cost_usd: float | None = None,
) -> dict[str, object]:
    return {
        "site_id": site_id,
        "source": source,
        "status": "MEASURED",
        "revision": "a" * 40,
        "revision_status": "VERIFIED",
        "revision_evidence": revision_evidence(source),
        "provider": "provider-a",
        "model": "model-a",
        "timeout_ms": 1000,
        "max_output_tokens": 100,
        "profile_version": "synthetic-v1",
        "initial_state": "EMPTY",
        "inconclusive_reason": None,
        "usage": {
            "provider_calls": provider_calls,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd,
            "duration_ms": 200,
        },
        "candidates": candidates,
    }


def observations() -> dict[str, object]:
    retained = candidate(
        "c001",
        "f001",
        ["DISCOVERED", "MAPPED", "BOUND", "WRITTEN", "RETAINED"],
        mapping_result="CORRECT",
        write_result="CORRECT",
    )
    failed_mapping = candidate(
        "c001",
        "f001",
        ["DISCOVERED", "MAPPED", "BOUND", "WRITTEN"],
        mapping_result="INCORRECT",
        write_result="INCORRECT",
        terminal_result="FAILED",
        reason_code="RETENTION_FAILED",
        existing_value_changed=True,
    )
    deferred = candidate(
        "c002",
        "f002",
        ["DISCOVERED", "MAPPED"],
        mapping_result="CORRECT",
        terminal_result="DEFERRED",
        reason_code="BINDING_UNSUPPORTED",
    )
    return {
        "contract_version": "1.1",
        "runs": [
            measured_run("alpha", "LIVE_SITE", [retained]),
            measured_run("beta", "LIVE_SITE", [failed_mapping]),
            measured_run("alpha", "FIXTURE", [retained, deferred]),
            measured_run("beta", "FIXTURE", [retained]),
        ],
        "follow_up_priorities": [],
    }


class GenericAutofillEvaluationTest(unittest.TestCase):
    def test_counts_terminal_reasons_separately_from_undiscovered_fields(self) -> None:
        result = evaluate_generic_autofill(ground_truth(), observations())
        live = result["sources"]["LIVE_SITE"]
        fixture = result["sources"]["FIXTURE"]["overall"]

        self.assertEqual(1, live["overall"]["reason_counts"]["FAILED"]["RETENTION_FAILED"])
        self.assertEqual(0, live["overall"]["reason_counts"]["DEFERRED"]["BINDING_UNSUPPORTED"])
        self.assertEqual(1, fixture["reason_counts"]["DEFERRED"]["BINDING_UNSUPPORTED"])
        self.assertEqual(1, sum(live["overall"]["reason_counts"]["FAILED"].values()))
        self.assertEqual(0, sum(live["overall"]["reason_counts"]["DEFERRED"].values()))
        self.assertEqual(1, live["sites"]["alpha"]["undiscovered_autofillable_count"])
        self.assertEqual(1, live["overall"]["undiscovered_autofillable_count"])
        self.assertEqual(0, fixture["undiscovered_autofillable_count"])
        self.assertEqual(
            [{"site_id": "beta", "candidate_id": "c001", "field_id": "f001",
              "terminal_result": "FAILED", "reason_code": "RETENTION_FAILED"}],
            live["overall"]["reason_evidence"],
        )

    def test_marks_inconclusive_accounting_unmeasured(self) -> None:
        payload = observations()
        payload["runs"][0].update(
            status="INCONCLUSIVE", inconclusive_reason="PAGE_UNAVAILABLE", candidates=[]
        )
        result = evaluate_generic_autofill(ground_truth(), payload)
        site = result["sources"]["LIVE_SITE"]["sites"]["alpha"]
        self.assertIsNone(site["reason_counts"])
        self.assertIsNone(site["undiscovered_autofillable_count"])
        self.assertEqual(0, result["sources"]["LIVE_SITE"]["overall"]["undiscovered_autofillable_count"])

    def test_reports_all_autofillable_fields_when_nothing_was_discovered(self) -> None:
        payload = observations()
        payload["runs"][0]["candidates"] = []
        result = evaluate_generic_autofill(ground_truth(), payload)
        site = result["sources"]["LIVE_SITE"]["sites"]["alpha"]
        self.assertEqual(2, site["undiscovered_autofillable_count"])
        self.assertEqual(0, sum(site["reason_counts"]["FAILED"].values()))

    def test_aggregates_sources_separately_with_hand_checked_metrics(self) -> None:
        result = evaluate_generic_autofill(ground_truth(), observations())

        live = result["sources"]["LIVE_SITE"]["overall"]
        fixture = result["sources"]["FIXTURE"]["overall"]

        self.assertEqual(
            {"numerator": 1, "denominator": 2, "rate": 0.5},
            live["mapping_precision"],
        )
        self.assertEqual(
            {"numerator": 1, "denominator": 3, "rate": 1 / 3},
            live["mapping_recall"],
        )
        self.assertEqual(
            {"numerator": 1, "denominator": 3, "rate": 1 / 3},
            live["correct_input_rate"],
        )
        self.assertEqual(
            {"numerator": 1, "denominator": 1, "rate": 1.0},
            live["execution_retention_rate"],
        )
        self.assertEqual(
            {"numerator": 1, "denominator": 2, "rate": 0.5},
            live["miswrite_rate"],
        )
        self.assertEqual(1, live["existing_value_damage"])
        self.assertEqual(
            {
                "DISCOVERED": 2,
                "MAPPED": 2,
                "BOUND": 2,
                "WRITTEN": 2,
                "RETAINED": 1,
                "DEFERRED": 0,
                "FAILED": 1,
            },
            live["stage_counts"],
        )
        self.assertEqual(
            {
                "provider_calls": 2,
                "input_tokens": 20,
                "output_tokens": 10,
                "cost_usd": None,
                "duration_ms": 400,
            },
            live["usage"],
        )
        self.assertNotEqual(live, fixture)

    def test_returns_the_same_result_without_mutating_inputs(self) -> None:
        truth = ground_truth()
        runs = observations()
        original_truth = copy.deepcopy(truth)
        original_runs = copy.deepcopy(runs)

        first = evaluate_generic_autofill(truth, runs)
        second = evaluate_generic_autofill(truth, runs)

        self.assertEqual(first, second)
        self.assertEqual(original_truth, truth)
        self.assertEqual(original_runs, runs)

    def test_uses_null_rate_when_a_dynamic_denominator_is_zero(self) -> None:
        payload = observations()
        payload["runs"][0]["candidates"] = [
            candidate(
                "c001",
                "f001",
                ["DISCOVERED"],
                mapping_result=None,
                terminal_result="FAILED",
                reason_code="MAPPING_NO_MATCH",
            )
        ]

        result = evaluate_generic_autofill(ground_truth(), payload)

        metric = result["sources"]["LIVE_SITE"]["sites"]["alpha"][
            "mapping_precision"
        ]
        self.assertEqual({"numerator": 0, "denominator": 0, "rate": None}, metric)

    def test_rejects_invalid_contract_branches(self) -> None:
        cases = {
            "missing-ground-truth-field": self._missing_ground_truth_field,
            "duplicate-candidate": self._duplicate_candidate,
            "reversed-stage": self._reversed_stage,
            "zero-autofillable-denominator": self._zero_autofillable_site,
            "unknown-failure-code": self._unknown_failure_code,
            "private-key": self._private_key,
            "unknown-field": self._unknown_field,
            "incomplete-retained-prefix": self._incomplete_retained_prefix,
            "inconclusive-with-candidate": self._inconclusive_with_candidate,
            "tokens-without-provider-call": self._tokens_without_provider_call,
        }

        for name, mutate in cases.items():
            with self.subTest(name=name):
                truth = ground_truth()
                runs = observations()
                mutate(truth, runs)
                with self.assertRaises(EvaluationError):
                    evaluate_generic_autofill(truth, runs)

    @staticmethod
    def _missing_ground_truth_field(
        truth: dict[str, object], runs: dict[str, object]
    ) -> None:
        del truth["sites"][0]["fields"][0]["control_kind"]

    @staticmethod
    def _duplicate_candidate(
        truth: dict[str, object], runs: dict[str, object]
    ) -> None:
        runs["runs"][0]["candidates"].append(
            copy.deepcopy(runs["runs"][0]["candidates"][0])
        )

    @staticmethod
    def _reversed_stage(truth: dict[str, object], runs: dict[str, object]) -> None:
        runs["runs"][0]["candidates"][0]["stages"] = ["MAPPED", "DISCOVERED"]

    @staticmethod
    def _zero_autofillable_site(
        truth: dict[str, object], runs: dict[str, object]
    ) -> None:
        truth["sites"][1]["fields"][0]["classification"] = "FORBIDDEN"
        truth["sites"][1]["fields"][0]["classification_reason"] = "SENSITIVE_FIELD"

    @staticmethod
    def _unknown_failure_code(
        truth: dict[str, object], runs: dict[str, object]
    ) -> None:
        runs["runs"][1]["candidates"][0]["reason_code"] = "UNKNOWN"

    @staticmethod
    def _private_key(truth: dict[str, object], runs: dict[str, object]) -> None:
        runs["runs"][0]["raw_html"] = "<input>"

    @staticmethod
    def _unknown_field(truth: dict[str, object], runs: dict[str, object]) -> None:
        runs["runs"][0]["candidates"][0]["field_id"] = "missing"

    @staticmethod
    def _incomplete_retained_prefix(
        truth: dict[str, object], runs: dict[str, object]
    ) -> None:
        runs["runs"][0]["candidates"][0]["stages"] = ["DISCOVERED", "RETAINED"]

    @staticmethod
    def _inconclusive_with_candidate(
        truth: dict[str, object], runs: dict[str, object]
    ) -> None:
        runs["runs"][0]["status"] = "INCONCLUSIVE"
        runs["runs"][0]["inconclusive_reason"] = "PAGE_UNAVAILABLE"

    @staticmethod
    def _measured_without_candidate(
        truth: dict[str, object], runs: dict[str, object]
    ) -> None:
        runs["runs"][0]["candidates"] = []

    @staticmethod
    def _tokens_without_provider_call(
        truth: dict[str, object], runs: dict[str, object]
    ) -> None:
        runs["runs"][0]["usage"]["provider_calls"] = 0


class GenericAutofillCliTest(unittest.TestCase):
    SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "evaluate-generic-autofill.py"

    def test_writes_the_same_deterministic_artifact_to_stdout_and_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            truth_path = self._write(root / "truth.json", ground_truth())
            runs_path = self._write(root / "runs.json", observations())
            output_path = root / "artifact.json"

            completed = self._run(
                "--ground-truth",
                str(truth_path),
                "--observations",
                str(runs_path),
                "--output",
                str(output_path),
            )

            self.assertEqual(0, completed.returncode, completed.stderr)
            self.assertEqual(json.loads(completed.stdout), json.loads(output_path.read_text()))
            self.assertTrue(completed.stdout.endswith("\n"))
            self.assertEqual(completed.stdout, output_path.read_text(encoding="utf-8"))

    def test_compares_rates_and_reports_harm_regressions(self) -> None:
        previous = observations()
        previous["runs"][1]["candidates"][0] = candidate(
            "c001",
            "f001",
            ["DISCOVERED", "MAPPED"],
            mapping_result="INCORRECT",
            terminal_result="FAILED",
            reason_code="MAPPING_INCORRECT",
        )
        current = observations()
        for run in current["runs"]:
            run["revision"] = "b" * 40
            run["revision_evidence"] = revision_evidence(run["source"], "b" * 40)
        current["runs"][0]["candidates"].append(
            candidate(
                "c002",
                "f002",
                ["DISCOVERED", "MAPPED", "BOUND", "WRITTEN", "RETAINED"],
                mapping_result="CORRECT",
                write_result="CORRECT",
            )
        )

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            truth_path = self._write(root / "truth.json", ground_truth())
            previous_path = self._write(root / "previous-runs.json", previous)
            current_path = self._write(root / "current-runs.json", current)
            baseline_path = root / "baseline.json"
            baseline = self._run(
                "--ground-truth",
                str(truth_path),
                "--observations",
                str(previous_path),
                "--output",
                str(baseline_path),
            )
            self.assertEqual(0, baseline.returncode, baseline.stderr)

            compared = self._run(
                "--ground-truth",
                str(truth_path),
                "--observations",
                str(current_path),
                "--compare-to",
                str(baseline_path),
            )

        self.assertEqual(0, compared.returncode, compared.stderr)
        result = json.loads(compared.stdout)
        live = result["comparison"]["sources"]["LIVE_SITE"]
        self.assertEqual(1 / 3, live["correct_input_rate"]["rate_delta"])
        self.assertEqual(1 / 3, live["miswrite_rate"]["rate_delta"])
        self.assertEqual(1, live["existing_value_damage_delta"])
        self.assertEqual(
            [
                {
                    "delta": 1,
                    "metric": "existing_value_damage",
                    "source": "LIVE_SITE",
                },
                {
                    "delta": 1 / 3,
                    "metric": "miswrite_rate",
                    "source": "LIVE_SITE",
                },
            ],
            result["comparison"]["regressions"],
        )

    def test_rejects_comparison_with_different_profile_version(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            truth_path = self._write(root / "truth.json", ground_truth())
            runs_path = self._write(root / "runs.json", observations())
            baseline_path = root / "baseline.json"
            baseline = self._run(
                "--ground-truth",
                str(truth_path),
                "--observations",
                str(runs_path),
                "--output",
                str(baseline_path),
            )
            self.assertEqual(0, baseline.returncode, baseline.stderr)
            previous = json.loads(baseline_path.read_text(encoding="utf-8"))
            previous["profile_version"] = "another-profile-version"
            self._write(baseline_path, previous)

            compared = self._run(
                "--ground-truth",
                str(truth_path),
                "--observations",
                str(runs_path),
                "--compare-to",
                str(baseline_path),
            )

        self.assertNotEqual(0, compared.returncode)
        self.assertIn("profile_version", compared.stderr)

    def test_holds_revision_judgment_for_same_or_unverified_installations(self) -> None:
        for unverified, expected_reason in (
            (False, "SAME_REVISION"), (True, "UNVERIFIED_REVISION"),
        ):
            with self.subTest(unverified=unverified), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                runs = observations()
                if unverified:
                    runs["runs"][0].update(
                        revision="UNVERIFIED", revision_status="UNVERIFIED",
                        revision_evidence=unavailable_evidence(),
                    )
                truth = self._write(root / "truth.json", ground_truth())
                observed = self._write(root / "runs.json", runs)
                baseline = root / "baseline.json"
                first = self._run("--ground-truth", str(truth), "--observations", str(observed),
                                  "--output", str(baseline))
                self.assertEqual(0, first.returncode, first.stderr)
                compared = self._run("--ground-truth", str(truth), "--observations", str(observed),
                                     "--compare-to", str(baseline))
                self.assertEqual(0, compared.returncode, compared.stderr)
                comparison = json.loads(compared.stdout)["comparison"]
                self.assertEqual([], comparison["regressions"])
                judgment = comparison["sources"]["LIVE_SITE"]["revision_comparison"]
                self.assertEqual("HELD", judgment["status"])
                self.assertIn(expected_reason, judgment["reasons"])
                self.assertEqual(0, comparison["sources"]["LIVE_SITE"]["correct_input_rate"]["rate_delta"])

    def test_rejects_invalid_json_without_a_traceback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            truth_path = root / "truth.json"
            truth_path.write_text("{", encoding="utf-8")
            runs_path = self._write(root / "runs.json", observations())

            completed = self._run(
                "--ground-truth",
                str(truth_path),
                "--observations",
                str(runs_path),
            )

        self.assertNotEqual(0, completed.returncode)
        self.assertIn("JSON 입력을 읽을 수 없습니다", completed.stderr)
        self.assertNotIn("Traceback", completed.stderr)

    def test_rejects_old_comparison_artifact_version(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            truth = self._write(root / "truth.json", ground_truth())
            observed = self._write(root / "runs.json", observations())
            baseline = evaluate_generic_autofill(ground_truth(), observations())
            baseline["contract_version"] = "1.0"
            old = self._write(root / "old.json", baseline)
            result = self._run(
                "--ground-truth", str(truth), "--observations", str(observed),
                "--compare-to", str(old),
            )
        self.assertNotEqual(0, result.returncode)
        self.assertIn("contract_version", result.stderr)

    @staticmethod
    def _write(path: Path, value: dict[str, object]) -> Path:
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        return path

    def _run(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            (sys.executable, str(self.SCRIPT), *arguments),
            cwd=Path(__file__).resolve().parents[2],
            capture_output=True,
            text=True,
            check=False,
        )


class GenericAutofillFixtureTest(unittest.TestCase):
    ROOT = Path(__file__).resolve().parents[2]
    FIXTURES = ROOT / "harness" / "fixtures" / "generic-autofill"
    SCRIPT = ROOT / "harness" / "scripts" / "evaluate-generic-autofill.py"

    def test_new_synthetic_fixture_exposes_accounting_and_revision_evidence(self) -> None:
        completed = subprocess.run(
            (
                sys.executable, str(self.SCRIPT),
                "--ground-truth", str(self.FIXTURES / "ground-truth-v1.1.json"),
                "--observations", str(self.FIXTURES / "observations-v1.1.json"),
            ),
            cwd=self.ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(0, completed.returncode, completed.stderr)
        result = json.loads(completed.stdout)
        live = result["sources"]["LIVE_SITE"]
        self.assertEqual(1, live["overall"]["reason_counts"]["FAILED"]["RETENTION_FAILED"])
        self.assertEqual(1, live["overall"]["undiscovered_autofillable_count"])
        self.assertEqual("VERIFIED", live["sites"]["alpha"]["revision_status"])
        self.assertEqual("UNVERIFIED", live["sites"]["beta"]["revision_status"])

    def test_preserves_historical_fixtures_and_rejects_the_old_contract(self) -> None:
        truth_path = self.FIXTURES / "ground-truth-v1.json"
        runs_path = self.FIXTURES / "observations-v1.json"
        baseline_path = self.FIXTURES / "baseline-v1.json"
        truth = json.loads(truth_path.read_text(encoding="utf-8"))
        runs = json.loads(runs_path.read_text(encoding="utf-8"))
        expected_sites = {
            "naver-cloud",
            "lg-ai-research",
            "neowiz-lever",
            "kakao-mobility-greeting",
            "megazone",
        }

        self.assertEqual(expected_sites, {site["site_id"] for site in truth["sites"]})
        self.assertEqual(
            expected_sites,
            {
                run["site_id"]
                for run in runs["runs"]
                if run["source"] == "LIVE_SITE"
            },
        )
        self.assertEqual(
            expected_sites,
            {
                run["site_id"]
                for run in runs["runs"]
                if run["source"] == "FIXTURE"
            },
        )
        self.assertTrue(
            all(
                run["status"] in {"MEASURED", "INCONCLUSIVE"}
                for run in runs["runs"]
                if run["source"] == "LIVE_SITE"
            )
        )
        self.assertTrue(
            all(
                run["status"] == "MEASURED"
                for run in runs["runs"]
                if run["source"] == "FIXTURE"
            )
        )
        self.assertEqual(3, len(runs["follow_up_priorities"]))

        completed = subprocess.run(
            (
                sys.executable,
                str(self.SCRIPT),
                "--ground-truth",
                str(truth_path),
                "--observations",
                str(runs_path),
            ),
            cwd=self.ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertNotEqual(0, completed.returncode)
        self.assertIn("contract_version", completed.stderr)
        self.assertEqual("1.0", json.loads(baseline_path.read_text(encoding="utf-8"))["contract_version"])


if __name__ == "__main__":
    unittest.main()
