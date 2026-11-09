import contextlib
import io
import json
import stat
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from pushload.mock_server import MockState, RequestLog, build_server, make_config

from tests.fakes import FakeDatabase
from tests.scripts import load_script
from tests.test_postings import FakeAdminApi

URI = "mongodb://user:db-password@127.0.0.1:27018/career_form_loadtest"
TEST_SUBSCRIPTION = {"_id": "t1", "endpoint": "http://mock-push:8080/fcm/send/loadtest-old-a"}
REAL_SUBSCRIPTION = {"_id": "s1", "endpoint": "https://fcm.googleapis.com/fcm/send/real"}


def run(script, argv, environ, database):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = script.main(argv, environ, connect=lambda uri: database)
    return code, out.getvalue() + err.getvalue()


class GenerateSubscriptionsScriptTest(unittest.TestCase):
    def setUp(self):
        self.script = load_script("generate-subscriptions")
        self.directory = tempfile.TemporaryDirectory()
        self.run_dir = Path(self.directory.name) / "20261109T010203Z-s1"

    def tearDown(self):
        self.directory.cleanup()

    def test_inserts_subscriptions_and_keeps_keys_locally(self):
        database = FakeDatabase()
        code, output = run(self.script, ["--run-dir", str(self.run_dir), "--count", "3", "--seed", "1"], {"LOADTEST_MONGODB_URI": URI}, database)
        self.assertEqual(0, code, output)
        self.assertEqual(3, len(database.push_subscriptions.documents))
        keys = self.run_dir / "subscriber-keys.jsonl"
        self.assertEqual(3, len(keys.read_text().splitlines()))
        self.assertEqual(0o600, stat.S_IMODE(keys.stat().st_mode))
        run_record = json.loads((self.run_dir / "run.json").read_text())
        self.assertEqual(("20261109T010203Z-s1", 3), (run_record["runId"], run_record["subscriptions"]["count"]))
        self.assertNotIn("db-password", output)

    def test_stops_without_writing_when_foreign_subscriptions_exist(self):
        database = FakeDatabase(push_subscriptions=[REAL_SUBSCRIPTION])
        code, output = run(self.script, ["--run-dir", str(self.run_dir), "--count", "3"], {"LOADTEST_MONGODB_URI": URI}, database)
        self.assertEqual(3, code)
        self.assertEqual([], database.writes())
        self.assertFalse(self.run_dir.exists())
        self.assertIn("1개", output)
        self.assertNotIn("fcm.googleapis.com", output)

    def test_invalid_arguments_stop_before_any_file_or_write(self):
        for extra in (["--endpoint-length", "50"], ["--unselected-ratio", "1.5"], ["--mock-base", "https://mock-push"]):
            with self.subTest(extra=extra):
                database = FakeDatabase()
                code, output = run(self.script, ["--run-dir", str(self.run_dir), "--count", "3", *extra], {"LOADTEST_MONGODB_URI": URI}, database)
                self.assertEqual(2, code, output)
                self.assertEqual([], database.writes())
                self.assertFalse(self.run_dir.exists())

    def test_requires_mongodb_uri_from_environment(self):
        code, output = run(self.script, ["--run-dir", str(self.run_dir), "--count", "3"], {}, FakeDatabase())
        self.assertEqual(2, code)
        self.assertIn("LOADTEST_MONGODB_URI", output)


class RegisterPostingsScriptTest(unittest.TestCase):
    def setUp(self):
        self.script = load_script("register-postings")
        self.api = FakeAdminApi(subscriptions=1)
        self.directory = tempfile.TemporaryDirectory()
        self.run_dir = Path(self.directory.name) / "r1"
        self.environ = {"LOADTEST_MONGODB_URI": URI, "LOADTEST_ADMIN_PASSWORD": "secret"}

    def tearDown(self):
        self.api.close()
        self.directory.cleanup()

    def test_registers_postings_and_records_run(self):
        argv = ["--run-dir", str(self.run_dir), "--count", "2", "--api", self.api.url, "--note", "commit=abc123", "--note", "concurrency=20"]
        code, output = run(self.script, argv, self.environ, FakeDatabase(push_subscriptions=[TEST_SUBSCRIPTION]))
        self.assertEqual(0, code, output)
        postings = json.loads((self.run_dir / "run.json").read_text())["postings"]
        self.assertEqual(2, len(postings["items"]))
        self.assertEqual({"commit": "abc123", "concurrency": "20"}, postings["notes"])
        posts = [request for request in self.api.requests if request["body"] is not None]
        self.assertEqual(23, len(posts[0]["body"]["roles"]))
        self.assertEqual({"commit", "dirty"}, set(postings["repository"]))
        self.assertNotIn("secret", output)
        self.assertNotIn("secret", (self.run_dir / "run.json").read_text())

    def test_warns_when_registration_ends_after_scheduled_time(self):
        argv = ["--run-dir", str(self.run_dir), "--api", self.api.url, "--opens-in-seconds", "0", "--mock-url", "http://127.0.0.1:9"]
        code, output = run(self.script, argv, self.environ, FakeDatabase(push_subscriptions=[TEST_SUBSCRIPTION]))
        self.assertEqual(0, code, output)
        self.assertIn("늦게", output)
        self.assertIn("모의 서버 설정을 읽지 못해", output)
        self.assertEqual(1, len(json.loads((self.run_dir / "run.json").read_text())["postings"]["warnings"]))

    def test_stops_before_any_request_when_foreign_subscriptions_exist(self):
        argv = ["--run-dir", str(self.run_dir), "--api", self.api.url]
        code, _ = run(self.script, argv, self.environ, FakeDatabase(push_subscriptions=[REAL_SUBSCRIPTION]))
        self.assertEqual(3, code)
        self.assertEqual([], self.api.requests)
        self.assertFalse((self.run_dir / "run.json").exists())

    def test_stops_when_api_sees_a_different_database(self):
        argv = ["--run-dir", str(self.run_dir), "--api", self.api.url]
        code, output = run(self.script, argv, self.environ, FakeDatabase(push_subscriptions=[TEST_SUBSCRIPTION, dict(TEST_SUBSCRIPTION, _id="t2")]))
        self.assertEqual(3, code, output)
        self.assertIn("전체 1, 직무 선택 0", output)
        self.assertEqual([], [request for request in self.api.requests if request["body"] is not None])
        self.assertFalse((self.run_dir / "run.json").exists())

    def test_summary_without_counts_is_reported_as_unexpected_response(self):
        self.api.summary_body = {"subscriptions": 1}
        argv = ["--run-dir", str(self.run_dir), "--api", self.api.url]
        code, output = run(self.script, argv, self.environ, FakeDatabase(push_subscriptions=[TEST_SUBSCRIPTION]))
        self.assertEqual(1, code)
        self.assertIn("구독 수 없음", output)
        self.assertEqual([], [request for request in self.api.requests if request["body"] is not None])

    def test_unreachable_api_stops_without_registering(self):
        argv = ["--run-dir", str(self.run_dir), "--api", "http://127.0.0.1:9"]
        code, output = run(self.script, argv, self.environ, FakeDatabase(push_subscriptions=[TEST_SUBSCRIPTION]))
        self.assertEqual(1, code)
        self.assertIn("연결하지 못했습니다", output)
        self.assertFalse((self.run_dir / "run.json").exists())

    def test_records_mock_settings_and_warns_when_unreadable(self):
        with tempfile.TemporaryDirectory() as directory:
            log = RequestLog(str(Path(directory) / "requests.jsonl"))
            server = build_server("127.0.0.1", 0, MockState(make_config(0, "201=1", 60)), log, seed=7)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                argv = ["--run-dir", str(self.run_dir), "--api", self.api.url, "--mock-url", f"http://127.0.0.1:{server.server_address[1]}"]
                code, output = run(self.script, argv, self.environ, FakeDatabase(push_subscriptions=[TEST_SUBSCRIPTION]))
            finally:
                server.shutdown()
                server.server_close()
                log.close()
        self.assertEqual(0, code, output)
        postings = json.loads((self.run_dir / "run.json").read_text())["postings"]
        self.assertEqual({"delayMs": 0, "statuses": "201=1", "retryAfterSeconds": 60, "seed": 7}, postings["mock"])
        self.assertNotIn("모의 서버 설정을 읽지 못해", output)

    def test_missing_git_records_null_commit(self):
        with mock.patch.object(self.script.subprocess, "run", side_effect=OSError("git missing")):
            self.assertEqual({"commit": None, "dirty": None}, self.script._repository())

    def test_wrong_password_stops_at_target_check_without_registering(self):
        argv = ["--run-dir", str(self.run_dir), "--api", self.api.url]
        code, output = run(self.script, argv, {**self.environ, "LOADTEST_ADMIN_PASSWORD": "wrong"}, FakeDatabase(push_subscriptions=[TEST_SUBSCRIPTION]))
        self.assertEqual(1, code)
        self.assertIn("401", output)
        self.assertNotIn("wrong", output)
        self.assertEqual([], [request for request in self.api.requests if request["body"] is not None])
        self.assertFalse((self.run_dir / "run.json").exists())

    def test_records_partial_results_when_registration_fails(self):
        self.api.links["https://loadtest.invalid/r1/2"] = "f" * 32
        argv = ["--run-dir", str(self.run_dir), "--api", self.api.url, "--count", "2"]
        code, output = run(self.script, argv, self.environ, FakeDatabase(push_subscriptions=[TEST_SUBSCRIPTION]))
        self.assertEqual(1, code)
        self.assertIn("409", output)
        postings = json.loads((self.run_dir / "run.json").read_text())["postings"]
        self.assertEqual((409, "DUPLICATE_LINK", 1), (postings["error"]["status"], postings["error"]["code"], len(postings["items"])))

    def test_requires_admin_password(self):
        code, output = run(self.script, ["--run-dir", str(self.run_dir), "--api", self.api.url], {"LOADTEST_MONGODB_URI": URI}, FakeDatabase())
        self.assertEqual(2, code)
        self.assertIn("LOADTEST_ADMIN_PASSWORD", output)

    def test_rejects_unknown_role_code(self):
        argv = ["--run-dir", str(self.run_dir), "--api", self.api.url, "--roles", "NOT_A_ROLE"]
        code, _ = run(self.script, argv, self.environ, FakeDatabase())
        self.assertEqual(2, code)
        self.assertEqual([], self.api.requests)


class CleanupScriptTest(unittest.TestCase):
    def setUp(self):
        self.script = load_script("cleanup-test-data")

    def database(self):
        return FakeDatabase(push_subscriptions=[TEST_SUBSCRIPTION, REAL_SUBSCRIPTION],
                            job_postings=[{"_id": "p1", "link": "https://loadtest.invalid/r1/1"}],
                            push_deliveries=[{"_id": "d1", "postingId": "p1", "subscriptionId": "t1"}])

    def test_shows_counts_without_deleting_by_default(self):
        database = self.database()
        code, output = run(self.script, [], {"LOADTEST_MONGODB_URI": URI}, database)
        self.assertEqual(0, code)
        self.assertIn("--yes", output)
        self.assertEqual([], database.writes())

    def test_deletes_marked_documents_with_yes(self):
        database = self.database()
        code, output = run(self.script, ["--yes"], {"LOADTEST_MONGODB_URI": URI}, database)
        self.assertEqual(0, code, output)
        self.assertEqual(["s1"], [document["_id"] for document in database.push_subscriptions.documents])
        self.assertEqual([], database.push_deliveries.documents)


if __name__ == "__main__":
    unittest.main()
