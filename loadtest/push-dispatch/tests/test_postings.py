import base64
import datetime as dt
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pushload.postings import (
    AdminClient,
    RegistrationError,
    basic_authorization,
    late_warning,
    posting_link,
    register_all,
    registration_payload,
)

UTC = dt.timezone.utc
OPENS = dt.datetime(2026, 11, 9, 10, 2, tzinfo=UTC)
CLOSES = OPENS + dt.timedelta(days=7)


class FakeAdminApi:
    """공고 관리 API 흉내. 비밀번호 secret만 받고 같은 링크는 409로 거절한다."""

    def __init__(self, subscriptions=0, registered_body=None, summary_body=None):
        self.requests = []
        self.links = {}
        self.subscriptions = subscriptions
        self.registered_body = registered_body
        self.summary_body = summary_body
        api = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                return

            def do_GET(self):
                api.requests.append({"path": self.path, "headers": dict(self.headers), "body": None})
                if self.headers.get("Authorization") != basic_authorization("secret"):
                    return self.reply(401, {"error": "UNAUTHORIZED"})
                if not self.path.startswith("/api/v1/notifications/admin/summary?from="):
                    return self.reply(404, {"error": "NOT_FOUND"})
                self.reply(200, api.summary_body if api.summary_body is not None
                           else {"postings": 0, "subscriptions": api.subscriptions, "roleSelectedSubscriptions": 0})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                api.requests.append({"path": self.path, "headers": dict(self.headers), "body": body})
                if self.headers.get("Authorization") != basic_authorization("secret"):
                    return self.reply(401, {"error": "UNAUTHORIZED"})
                if body["link"] in api.links:
                    return self.reply(409, {"error": "DUPLICATE_LINK", "postingId": api.links[body["link"]]})
                api.links[body["link"]] = f"{len(api.links) + 1:032x}"
                if api.registered_body is not None:
                    return self.reply(201, api.registered_body)
                self.reply(201, {"id": api.links[body["link"]], "scheduledAt": body["opensAt"], "deliveries": 3})

            def reply(self, status, payload):
                encoded = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class PayloadTest(unittest.TestCase):
    def test_builds_registration_body(self):
        self.assertEqual(
            {"company": "loadtest 2", "roles": ["a1", "b1"], "link": "https://loadtest.invalid/r1/2",
             "opensAt": "2026-11-09T10:02:00.000Z", "closesAt": "2026-11-16T10:02:00.000Z"},
            registration_payload("r1", 2, ("a1", "b1"), OPENS, CLOSES),
        )

    def test_link_carries_test_marker(self):
        self.assertEqual("https://loadtest.invalid/r1/7", posting_link("r1", 7))
        with self.assertRaises(ValueError):
            posting_link("r/1", 7)

    def test_basic_authorization_uses_quality_user(self):
        encoded = basic_authorization("secret").removeprefix("Basic ")
        self.assertEqual("quality:secret", base64.b64decode(encoded).decode())


class RegisterTest(unittest.TestCase):
    def setUp(self):
        self.api = FakeAdminApi()

    def tearDown(self):
        self.api.close()

    def test_registers_each_posting_and_records_results(self):
        payloads = [registration_payload("r1", number, ("a1",), OPENS, CLOSES) for number in (1, 2)]
        report = register_all(AdminClient(self.api.url, "secret"), payloads)
        self.assertEqual([1, 2], [posting["number"] for posting in report["postings"]])
        self.assertEqual({"number", "id", "link", "scheduledAt", "deliveries", "registerMs"}, set(report["postings"][0]))
        self.assertEqual((3, "2026-11-09T10:02:00.000Z"), (report["postings"][0]["deliveries"], report["postings"][0]["scheduledAt"]))
        self.assertEqual({"startedAt", "finishedAt", "durationMs", "postings"}, set(report))
        self.assertEqual("/api/v1/notifications/admin/postings", self.api.requests[0]["path"])
        self.assertNotIn("Origin", self.api.requests[0]["headers"])

    def test_stops_on_conflict_and_keeps_partial_results(self):
        payload = registration_payload("r1", 1, ("a1",), OPENS, CLOSES)
        with self.assertRaises(RegistrationError) as raised:
            register_all(AdminClient(self.api.url, "secret"), [payload, payload])
        self.assertEqual((409, "DUPLICATE_LINK", 1), (raised.exception.status, raised.exception.code, len(raised.exception.registered)))

    def test_wrong_password_reports_status_without_password(self):
        with self.assertRaises(RegistrationError) as raised:
            register_all(AdminClient(self.api.url, "wrong-password"), [registration_payload("r1", 1, ("a1",), OPENS, CLOSES)])
        self.assertEqual(401, raised.exception.status)
        self.assertNotIn("wrong-password", str(raised.exception))

    def test_unexpected_created_body_is_an_error(self):
        self.api.registered_body = {"id": "abc"}
        with self.assertRaises(RegistrationError) as raised:
            register_all(AdminClient(self.api.url, "secret"), [registration_payload("r1", 1, ("a1",), OPENS, CLOSES)])
        self.assertEqual((201, "UNEXPECTED_RESPONSE", 0), (raised.exception.status, raised.exception.code, len(raised.exception.registered)))
        self.assertIn("관리 화면", str(raised.exception))

    def test_summary_reads_subscription_count_with_same_authorization(self):
        self.api.subscriptions = 7
        result = AdminClient(self.api.url, "secret").summary(OPENS - dt.timedelta(hours=1), OPENS)
        self.assertEqual((200, 7), (result.status, result.body["subscriptions"]))
        self.assertIn("from=2026-11-09T09%3A02%3A00.000Z", self.api.requests[0]["path"])
        self.assertEqual(401, AdminClient(self.api.url, "wrong").summary(OPENS - dt.timedelta(hours=1), OPENS).status)

    def test_client_repr_hides_password(self):
        self.assertNotIn("secret", repr(AdminClient(self.api.url, "secret")))


class LateWarningTest(unittest.TestCase):
    def test_warns_when_registration_finishes_after_scheduled_time(self):
        warning = late_warning(OPENS + dt.timedelta(seconds=3), OPENS)
        self.assertIn("3.0초", warning)

    def test_no_warning_when_finished_before(self):
        self.assertIsNone(late_warning(OPENS - dt.timedelta(seconds=1), OPENS))


if __name__ == "__main__":
    unittest.main()
