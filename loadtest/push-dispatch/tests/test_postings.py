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

    def __init__(self):
        self.requests = []
        self.links = {}
        api = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                return

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                api.requests.append({"path": self.path, "headers": dict(self.headers), "body": body})
                if self.headers.get("Authorization") != basic_authorization("secret"):
                    return self.reply(401, {"error": "UNAUTHORIZED"})
                if body["link"] in api.links:
                    return self.reply(409, {"error": "DUPLICATE_LINK", "postingId": api.links[body["link"]]})
                api.links[body["link"]] = f"{len(api.links) + 1:032x}"
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
