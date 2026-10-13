import json
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from harness.lib.field_mapping_benchmark import (
    BenchmarkError,
    candidates_in_order,
    deidentify_request,
    evaluate_benchmark,
    parse_fields_response,
    parse_jev_log,
)

ROOT = Path(__file__).resolve().parents[2]


def field(candidate_id: str, label: str, **extra: object) -> dict[str, object]:
    return {
        "candidateId": candidate_id,
        "element": "input",
        "control": "text",
        "visibility": "visible",
        "displayName": label,
        **extra,
    }


def captured_request() -> dict[str, object]:
    return {
        "schemaVersion": 2,
        "snapshotId": "fields-7c1f",
        "site": {"host": "recruit.example.com", "pathPattern": "/apply/step2.do"},
        "supportedWriteCommands": ["SET_TEXT"],
        "sections": [
            {
                "sectionId": "section-1",
                "displayName": "기본정보",
                "fields": [
                    field(
                        "field-email", "이메일", domId="userEmail", domName="email",
                        options=[{"optionId": "field-email-option-1", "displayName": "gmail.com"}],
                    ),
                    field("field-phone", "연락처", domId="tel"),
                ],
            },
            {
                "sectionId": "section-2",
                "parentSectionId": "section-1",
                "fields": [],
                "items": [
                    {
                        "itemId": "row-a",
                        "itemGroupId": "group-x",
                        "fields": [
                            field(
                                "field-company",
                                "회사명",
                                semanticContext={
                                    "labels": [{"source": "label", "text": "회사명"}],
                                    "repeat": {"groupId": "group-x", "rowIndex": 0, "rowCount": 1},
                                },
                            )
                        ],
                    }
                ],
            },
        ],
    }


def benchmark_request() -> dict[str, object]:
    return deidentify_request(captured_request(), "alpha")[0]


def labels(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "contract_version": "1.0",
        "label_status": "DRAFT",
        "profile_keys": ["contact.contact.email", "contact.contact.phoneNumber", "careers.career.companyName"],
        "sites": [
            {
                "site_id": "alpha",
                "labels": [
                    {"candidate_id": "c001", "expected": "DIRECT:contact.contact.email", "review": "CONFIRMED"},
                    {"candidate_id": "c002", "expected": "NO_MATCH", "review": "NEEDS_REVIEW"},
                    {"candidate_id": "c003", "expected": "DIRECT:careers.career.companyName", "review": "CONFIRMED"},
                ],
            }
        ],
    }
    value.update(overrides)
    return value


def jev_answer(raw: str, confidence: float) -> dict[str, object]:
    return {"raw_choice": raw, "confidence": confidence, "top_probabilities": {raw: confidence}}


def results(provider: str, candidates: list[dict[str, object]], status: str = "COMPLETE") -> dict[str, object]:
    return {
        "contract_version": "1.0",
        "provider": provider,
        "model": "model-a",
        "collected_with": "synthetic",
        "sites": [{"site_id": "alpha", "analysis_status": status, "candidates": candidates}],
    }


def jev_line(request_id: str, question: str, choice: str, confidence: float, probabilities: str) -> str:
    return (
        f"2026-10-13T06:00:00.000Z  INFO [requestId={request_id}] 7 --- [backend] [handler] "
        f"c.c.f.i.adapter.jev.JevClient : [JEV] 분류 결과 question={question} choice={choice} "
        f"confidence={confidence} selected={choice} probabilities={{{probabilities}}}"
    )


class DeidentifyTest(unittest.TestCase):
    def test_replaces_location_and_identifiers_with_stable_aliases(self) -> None:
        request, aliases = deidentify_request(captured_request(), "alpha")

        self.assertEqual(request["site"], {"host": "alpha.benchmark.invalid", "pathPattern": "/apply"})
        self.assertEqual(request["snapshotId"], "benchmark-alpha-fields")
        self.assertEqual([c["candidateId"] for c in candidates_in_order(request)], ["c001", "c002", "c003"])
        first = request["sections"][0]["fields"][0]
        self.assertEqual((first["domId"], first["domName"]), ("d001", "n001"))
        self.assertNotIn("domName", request["sections"][0]["fields"][1])
        second = request["sections"][1]
        self.assertEqual((second["sectionId"], second["parentSectionId"]), ("s02", "s01"))
        item = second["items"][0]
        self.assertEqual((item["itemId"], item["itemGroupId"]), ("i01", "g01"))
        self.assertEqual(item["fields"][0]["semanticContext"]["repeat"]["groupId"], "g01")
        self.assertEqual(aliases["candidates"]["field-company"], "c003")
        rendered = json.dumps(request, ensure_ascii=False)
        for secret in ("recruit.example.com", "step2", "userEmail", "fields-7c1f", "row-a", "group-x", "field-"):
            self.assertNotIn(secret, rendered)
        self.assertIn("회사명", rendered)

    def test_aliases_option_identifiers(self) -> None:
        request, _ = deidentify_request(captured_request(), "alpha")
        option = request["sections"][0]["fields"][0]["options"][0]
        self.assertEqual(option, {"optionId": "o001", "displayName": "gmail.com"})

    def test_rejects_requests_without_sections(self) -> None:
        with self.assertRaises(BenchmarkError):
            deidentify_request({"schemaVersion": 2, "sections": []}, "alpha")


class ParsingTest(unittest.TestCase):
    def test_fields_response_maps_bindings_and_missing_candidates(self) -> None:
        response = {
            "analysisStatus": "COMPLETE",
            "fields": [
                {"candidateId": "c001", "matchType": "MATCH", "valueBinding": {"type": "DIRECT", "profileFieldKey": "contact.contact.email"}},
                {"candidateId": "c002", "matchType": "MATCH", "valueBinding": {"type": "DERIVED", "recipe": "KOREAN_FULL_NAME"}},
                {"candidateId": "c003", "matchType": "NO_MATCH"},
            ],
        }
        parsed = parse_fields_response(response, ["c001", "c002", "c003", "c004"])
        self.assertEqual(parsed, {
            "c001": "DIRECT:contact.contact.email",
            "c002": "DERIVED:KOREAN_FULL_NAME",
            "c003": "NO_MATCH",
            "c004": "NO_MATCH",
        })

    def test_unavailable_response_marks_every_candidate_as_error(self) -> None:
        parsed = parse_fields_response({"analysisStatus": "PARTIAL", "warningCodes": ["LLM_UNAVAILABLE"], "fields": []}, ["c001"])
        self.assertEqual(parsed, {"c001": "ERROR"})

    def test_jev_log_uses_the_single_field_request_group_and_keeps_top_probabilities(self) -> None:
        text = "\n".join([
            jev_line("req-a", "field_0", "contact.contact.email", 0.97, "contact.contact.email=0.97, ABSTAIN=0.02, careers.career.companyName=0.01"),
            jev_line("req-a", "field_2", "ABSTAIN", 0.6, "ABSTAIN=0.6, careers.career.companyName=0.4"),
            jev_line("req-b", "action_0", "ADD", 0.9, "ADD=0.9, ABSTAIN=0.1"),
            "unrelated line",
        ])
        parsed = parse_jev_log(text, ["c001", "c002", "c003"], top_k=2)
        self.assertEqual(parsed["c001"], {
            "raw_choice": "contact.contact.email",
            "confidence": 0.97,
            "top_probabilities": {"contact.contact.email": 0.97, "ABSTAIN": 0.02},
        })
        self.assertEqual(parsed["c003"]["raw_choice"], "ABSTAIN")
        self.assertNotIn("c002", parsed)

    def test_jev_log_with_two_field_requests_is_ambiguous(self) -> None:
        text = "\n".join([
            jev_line("req-a", "field_0", "ABSTAIN", 0.9, "ABSTAIN=0.9"),
            jev_line("req-b", "field_0", "ABSTAIN", 0.9, "ABSTAIN=0.9"),
        ])
        with self.assertRaises(BenchmarkError):
            parse_jev_log(text, ["c001"], top_k=1)


class EvaluateTest(unittest.TestCase):
    def requests(self) -> dict[str, dict[str, object]]:
        return {"alpha": benchmark_request()}

    def test_scores_correct_wrong_and_missed_mappings(self) -> None:
        openai = results("openai", [
            {"candidate_id": "c001", "result": "DIRECT:contact.contact.email"},
            {"candidate_id": "c002", "result": "DIRECT:contact.contact.phoneNumber"},
            {"candidate_id": "c003", "result": "NO_MATCH"},
        ])
        report = evaluate_benchmark(labels(), self.requests(), [openai], thresholds=[])
        overall = report["providers"]["openai"]["overall"]
        self.assertEqual(
            {key: overall[key] for key in ("candidates", "positives", "predicted", "correct", "wrong", "missed", "errors")},
            {"candidates": 3, "positives": 2, "predicted": 2, "correct": 1, "wrong": 1, "missed": 1, "errors": 0},
        )
        self.assertEqual(overall["precision"], 0.5)
        self.assertEqual(overall["recall"], 0.5)
        self.assertAlmostEqual(overall["wrong_rate"], 1 / 3)
        self.assertEqual(report["providers"]["openai"]["sites"]["alpha"]["correct"], 1)
        self.assertEqual(report["labels"], {"status": "DRAFT", "needs_review": 1, "total": 3})

    def test_jev_thresholds_rescore_raw_choices(self) -> None:
        jev = results("jev", [
            {"candidate_id": "c001", "result": "DIRECT:contact.contact.email", "jev": jev_answer("contact.contact.email", 0.95)},
            {"candidate_id": "c002", "result": "NO_MATCH", "jev": jev_answer("contact.contact.phoneNumber", 0.7)},
            {"candidate_id": "c003", "result": "NO_MATCH", "jev": jev_answer("careers.career.companyName", 0.55)},
        ])
        report = evaluate_benchmark(labels(), self.requests(), [jev], thresholds=[0.8, 0.5])
        sweep = report["providers"]["jev"]["thresholds"]
        self.assertEqual((sweep["0.8"]["correct"], sweep["0.8"]["wrong"]), (1, 0))
        self.assertEqual((sweep["0.5"]["correct"], sweep["0.5"]["wrong"]), (2, 1))

    def test_derived_raw_choices_are_rescored_as_recipes(self) -> None:
        value = labels(sites=[{"site_id": "alpha", "labels": [
            {"candidate_id": "c001", "expected": "DERIVED:KOREAN_FULL_NAME", "review": "CONFIRMED"},
            *labels()["sites"][0]["labels"][1:],
        ]}])
        jev = results("jev", [
            {"candidate_id": "c001", "result": "NO_MATCH", "jev": jev_answer("KOREAN_FULL_NAME", 0.6)},
            {"candidate_id": "c002", "result": "NO_MATCH", "jev": jev_answer("ABSTAIN", 0.9)},
            {"candidate_id": "c003", "result": "NO_MATCH", "jev": jev_answer("ABSTAIN", 0.9)},
        ])
        sweep = evaluate_benchmark(value, self.requests(), [jev], thresholds=[0.5])["providers"]["jev"]["thresholds"]
        self.assertEqual(sweep["0.5"]["correct"], 1)

    def test_errors_are_counted_and_not_treated_as_predictions(self) -> None:
        failed = results("jev", [
            {"candidate_id": cid, "result": "ERROR"} for cid in ("c001", "c002", "c003")
        ], status="PARTIAL")
        overall = evaluate_benchmark(labels(), self.requests(), [failed], thresholds=[])["providers"]["jev"]["overall"]
        self.assertEqual((overall["errors"], overall["predicted"], overall["missed"]), (3, 0, 2))
        self.assertIsNone(overall["precision"])

    def test_rejects_incomplete_or_inconsistent_labels(self) -> None:
        broken = [
            labels(sites=[{"site_id": "alpha", "labels": labels()["sites"][0]["labels"][:2]}]),
            labels(sites=[{"site_id": "alpha", "labels": labels()["sites"][0]["labels"] + [{"candidate_id": "c001", "expected": "NO_MATCH", "review": "CONFIRMED"}]}]),
            labels(sites=[{"site_id": "alpha", "labels": labels()["sites"][0]["labels"] + [{"candidate_id": "c999", "expected": "NO_MATCH", "review": "CONFIRMED"}]}]),
            labels(sites=[{"site_id": "alpha", "labels": [{**labels()["sites"][0]["labels"][0], "expected": "DIRECT:unknown.key"}] + labels()["sites"][0]["labels"][1:]}]),
            labels(sites=[{"site_id": "alpha", "labels": [{**labels()["sites"][0]["labels"][0], "review": "MAYBE"}] + labels()["sites"][0]["labels"][1:]}]),
            labels(contract_version="0.9"),
            labels(sites=[{"site_id": "beta", "labels": []}]),
            labels(label_status="CONFIRMED"),
            labels(sites=[7]),
            labels(sites=[{"site_id": "alpha", "labels": ["c001"]}]),
        ]
        for value in broken:
            with self.subTest(value=value), self.assertRaises(BenchmarkError):
                evaluate_benchmark(value, self.requests(), [], thresholds=[])

    def test_rejects_results_that_do_not_cover_the_request(self) -> None:
        partial = results("openai", [{"candidate_id": "c001", "result": "NO_MATCH"}])
        malformed = results("openai", [{"candidate_id": cid, "result": "maybe"} for cid in ("c001", "c002", "c003")])

        def with_jev(judgment: object) -> dict[str, object]:
            return results("jev", [
                {"candidate_id": "c001", "result": "NO_MATCH", "jev": judgment},
                {"candidate_id": "c002", "result": "NO_MATCH"},
                {"candidate_id": "c003", "result": "NO_MATCH"},
            ])

        invalid = (
            partial, malformed, {**partial, "provider": ""},
            results("openai", [7, 8, 9]),
            with_jev({"raw_choice": "ABSTAIN", "top_probabilities": {}}),
            with_jev({"raw_choice": "ABSTAIN", "confidence": None, "top_probabilities": {}}),
            with_jev({"raw_choice": "unknown.key", "confidence": 0.9, "top_probabilities": {}}),
            with_jev({"raw_choice": "ABSTAIN", "confidence": 1.5, "top_probabilities": {}}),
            with_jev({"raw_choice": "ABSTAIN", "confidence": 0.9, "top_probabilities": {"ABSTAIN": "high"}}),
            with_jev("ABSTAIN"),
        )
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(BenchmarkError):
                evaluate_benchmark(labels(), self.requests(), [value], thresholds=[])


class CliTest(unittest.TestCase):
    def run_script(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, *arguments], cwd=ROOT, capture_output=True, text=True, check=False
        )

    def write_benchmark(self, directory: Path) -> Path:
        (directory / "requests").mkdir()
        (directory / "requests" / "alpha.json").write_text(json.dumps(benchmark_request(), ensure_ascii=False), encoding="utf-8")
        value = labels()
        value["sites"][0]["request"] = "requests/alpha.json"
        path = directory / "labels.json"
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        return path

    def test_deidentify_writes_request_and_alias_map(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "raw.json"
            source.write_text(json.dumps(captured_request()), encoding="utf-8")
            completed = self.run_script(
                "harness/scripts/deidentify-field-request.py", "--input", str(source), "--site-id", "alpha",
                "--output", str(Path(temp) / "out.json"), "--alias-map", str(Path(temp) / "map.json"),
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(json.loads((Path(temp) / "out.json").read_text())["site"]["host"], "alpha.benchmark.invalid")
            self.assertEqual(json.loads((Path(temp) / "map.json").read_text())["candidates"]["field-email"], "c001")

    def test_replay_and_evaluate_against_a_stub_backend(self) -> None:
        received: list[dict[str, object]] = []

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                received.append(body)
                payload = json.dumps({
                    "analysisStatus": "COMPLETE",
                    "fields": [{"candidateId": "c001", "matchType": "MATCH", "valueBinding": {"type": "DIRECT", "profileFieldKey": "contact.contact.email"}}],
                }).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *arguments: object) -> None:
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as temp:
                directory = Path(temp)
                label_path = self.write_benchmark(directory)
                log = jev_line("req-a", "field_0", "contact.contact.email", 0.97, "contact.contact.email=0.97, ABSTAIN=0.03")
                log_script = directory / "log.py"
                log_script.write_text(f"import sys\nprint({log!r})\n", encoding="utf-8")
                output = directory / "jev.json"
                completed = self.run_script(
                    "harness/scripts/replay-field-mapping.py", "--labels", str(label_path),
                    "--base-url", f"http://127.0.0.1:{server.server_port}", "--provider", "jev", "--model", "m",
                    "--collected-with", "stub", "--output", str(output), "--log-wait", "0",
                    "--jev-log-command", f"{sys.executable} {log_script} {{since}} {{until}}",
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertEqual(received[0]["snapshotId"], "benchmark-alpha-fields")
                written = json.loads(output.read_text())
                first = written["sites"][0]["candidates"][0]
                self.assertEqual((first["result"], first["jev"]["confidence"]), ("DIRECT:contact.contact.email", 0.97))
                self.assertNotIn("jev", written["sites"][0]["candidates"][1])

                report = self.run_script(
                    "harness/scripts/evaluate-field-mapping.py", "--labels", str(label_path),
                    "--results", str(output), "--thresholds", "0.8,0.5",
                )
                self.assertEqual(report.returncode, 0, report.stderr)
                metrics = json.loads(report.stdout)
                self.assertEqual(metrics["providers"]["jev"]["overall"]["correct"], 1)
                self.assertIn("0.5", metrics["providers"]["jev"]["thresholds"])
        finally:
            server.shutdown()
            server.server_close()

    def test_evaluate_reports_invalid_input(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            label_path = self.write_benchmark(Path(temp))
            bad = Path(temp) / "bad.json"
            bad.write_text(json.dumps(results("openai", [])), encoding="utf-8")
            completed = self.run_script(
                "harness/scripts/evaluate-field-mapping.py", "--labels", str(label_path), "--results", str(bad)
            )
            self.assertEqual(completed.returncode, 1)
            self.assertIn("오류", completed.stderr)


if __name__ == "__main__":
    unittest.main()
