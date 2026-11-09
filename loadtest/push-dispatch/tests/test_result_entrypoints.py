import base64
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from pushload.runfiles import parse_iso
from pushload.webpush import new_subscriber_keys
from tests.fakes import FakeDatabase
from tests.scripts import load_script
from tests.test_entrypoints import URI
from tests.test_resources import DOCKER_LINE, PROMETHEUS
from tests.webpush_sender import encrypt_for

SCHEDULED = "2026-11-09T10:00:00.000Z"
SCHEDULED_EPOCH = parse_iso(SCHEDULED).timestamp()


def write_lines(path, records):
    path.write_text("".join(json.dumps(record) + "\n" for record in records))


class SummarizeRunScriptTest(unittest.TestCase):
    def setUp(self):
        self.script = load_script("summarize-run")
        self.directory = tempfile.TemporaryDirectory()
        self.run_dir = Path(self.directory.name) / "r1"
        self.run_dir.mkdir()
        keys = {"/fcm/send/loadtest-r1-a": ("a" * 32, new_subscriber_keys()), "/fcm/send/loadtest-r1-b": ("b" * 32, new_subscriber_keys())}
        (self.run_dir / "run.json").write_text(json.dumps({
            "runId": "r1", "subscriptions": {"count": 2},
            "postings": {"count": 1, "opensAt": SCHEDULED, "notes": {"commit": "abc123"},
                         "repository": {"commit": "0123456789abcdef0123", "dirty": True},
                         "mock": {"delayMs": 100, "statuses": "201=1", "retryAfterSeconds": 60, "seed": 441},
                         "items": [{"number": 1, "id": "p1", "scheduledAt": SCHEDULED, "deliveries": 2, "registerMs": 300.0}]},
        }))
        write_lines(self.run_dir / "subscriber-keys.jsonl", [{"id": identifier, "path": path, **subscriber.to_record()}
                                                             for path, (identifier, subscriber) in keys.items()])
        payload = json.dumps({"id": "p1", "company": "loadtest 1"}).encode()
        (self.run_dir / "mock").mkdir()
        write_lines(self.run_dir / "mock" / "requests.jsonl", [
            {"receivedAt": SCHEDULED_EPOCH + 30 + offset, "respondedAt": SCHEDULED_EPOCH + 30.1 + offset, "path": path, "status": 201,
             "concurrency": 1 + offset, "retryAfter": None, "bodyBytes": 0, "body": base64.b64encode(encrypt_for(subscriber, payload)).decode()}
            for offset, (path, (_, subscriber)) in enumerate(keys.items())
        ] + [{"receivedAt": 1.0, "respondedAt": 1.1, "path": "/fcm/send/loadtest-old-z", "status": 201, "concurrency": 1, "retryAfter": None,
              "bodyBytes": 0, "body": ""}])
        sample = {"at": SCHEDULED_EPOCH, "containers": {"cf-push-loadtest-backend-1": {"name": "cf-push-loadtest-backend-1", "cpuPercent": 50.0,
                                                                                      "memBytes": 1000, "memLimitBytes": 2000}},
                  "metrics": [["career_form_push_dispatch_cycle_seconds_count", {}, 1.0]], "errors": []}
        write_lines(self.run_dir / "resources.jsonl", [sample, {**sample, "at": SCHEDULED_EPOCH + 60}])
        self.database = FakeDatabase(
            push_deliveries=[{"_id": f"d{n}", "postingId": "p1", "subscriptionId": f"s{n}", "status": "ACCEPTED", "lastReason": "ACCEPTED",
                              "attempts": 1} for n in range(2)],
            job_postings=[{"_id": "p1"}], push_subscriptions=[{"_id": "a" * 32}, {"_id": "b" * 32}])

    def tearDown(self):
        self.directory.cleanup()

    def run_script(self, argv, environ):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            code = self.script.main(argv, environ, connect=lambda uri: self.database)
        return code, out.getvalue()

    def test_writes_summary_and_prints_table(self):
        code, output = self.run_script(["--run-dir", str(self.run_dir)], {"LOADTEST_MONGODB_URI": URI})
        self.assertEqual(0, code, output)
        summary = json.loads((self.run_dir / "summary.json").read_text())
        self.assertEqual(("r1", "abc123"), (summary["runId"], summary["notes"]["commit"]))
        self.assertEqual({"records": 3, "matched": 2, "undecryptable": 0, "unknownPath": 1, "invalid": 0}, summary["requests"])
        self.assertEqual((2, 0, 2), (summary["delivery"]["accepted"], summary["delivery"]["duplicates"]["extra"], summary["delivery"]["maxConcurrency"]))
        self.assertEqual((2, 0, 0), (summary["mongo"]["deliveries"]["found"], summary["mongo"]["deliveries"]["lost"], summary["mongo"]["remainingGoneSubscriptions"]))
        self.assertEqual((2, 1), (summary["resources"]["wholeRun"]["samples"], summary["resources"]["sending"]["samples"]))
        self.assertEqual(summary["delivery"]["window"], summary["resources"]["sending"]["window"])
        self.assertEqual(("0123456789abcdef0123", 441), (summary["repository"]["commit"], summary["mock"]["seed"]))
        self.assertIn("| 커밋 | 0123456789ab (커밋하지 않은 변경 있음) |", output)
        self.assertIn("시드 441", output)
        self.assertNotIn("goneSubscriptionIds", summary["delivery"])
        self.assertIn("| 항목 | 값 |", output)
        self.assertIn("| 수락 | 2 |", output)
        self.assertNotIn("db-password", output)

    def test_can_summarize_without_mongodb(self):
        code, output = self.run_script(["--run-dir", str(self.run_dir), "--without-mongo"], {})
        self.assertEqual(0, code, output)
        self.assertIsNone(json.loads((self.run_dir / "summary.json").read_text())["mongo"])

    def test_requires_registered_postings(self):
        (self.run_dir / "run.json").write_text(json.dumps({"runId": "r1"}))
        code, output = self.run_script(["--run-dir", str(self.run_dir), "--without-mongo"], {})
        self.assertEqual(2, code)
        self.assertIn("postings", output)

    def test_skips_malformed_lines(self):
        with (self.run_dir / "mock" / "requests.jsonl").open("a") as requests:
            requests.write("{broken\n")
            requests.write(json.dumps({"path": "/fcm/send/loadtest-r1-a"}) + "\n")
        with (self.run_dir / "resources.jsonl").open("a") as resources:
            resources.write(json.dumps({"at": "soon"}) + "\n")
        with (self.run_dir / "subscriber-keys.jsonl").open("a") as keys:
            keys.write(json.dumps({"path": "/fcm/send/loadtest-r1-c"}) + "\n")
        code, output = self.run_script(["--run-dir", str(self.run_dir), "--without-mongo"], {})
        self.assertEqual(0, code, output)
        summary = json.loads((self.run_dir / "summary.json").read_text())
        self.assertEqual((3, 1), (summary["skippedRecords"], summary["requests"]["invalid"]))


class RecordResourcesScriptTest(unittest.TestCase):
    def test_samples_until_duration_and_appends_jsonl(self):
        script = load_script("record-resources")
        now = [1000.0]

        def sleep(seconds):
            now[0] += seconds

        with tempfile.TemporaryDirectory() as directory:
            run_dir = Path(directory) / "r1"
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = script.main(["--run-dir", str(run_dir), "--interval-seconds", "5", "--duration-seconds", "10"],
                                   run_docker=lambda containers: DOCKER_LINE, fetch_metrics=lambda: PROMETHEUS, sleep=sleep,
                                   clock=lambda: now[0], install_signals=False)
            lines = (run_dir / "resources.jsonl").read_text().splitlines()
        self.assertEqual(0, code)
        self.assertEqual([1000.0, 1005.0, 1010.0], [json.loads(line)["at"] for line in lines])
        self.assertIn("3", out.getvalue())


if __name__ == "__main__":
    unittest.main()
