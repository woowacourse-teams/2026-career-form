import base64
import contextlib
import io
import http.client
import json
import random
import tempfile
import threading
import time
import unittest
from pathlib import Path

from pushload.mock_server import (
    MockState,
    RequestLog,
    apply_config_update,
    build_server,
    make_config,
    parse_status_mix,
    pick_status,
)
from tests.scripts import load_script


class StatusMixTest(unittest.TestCase):
    def test_parses_codes_and_ratios_in_order(self):
        mix = parse_status_mix("201=0.9,429=0.05,503=0.03,410=0.01,400=0.01")
        self.assertEqual(((201, 0.9), (429, 0.05), (503, 0.03), (410, 0.01), (400, 0.01)), mix.weights)

    def test_accepts_spaces_around_parts(self):
        self.assertEqual(((201, 0.5), (503, 0.5)), parse_status_mix(" 201 = 0.5 , 503=0.5 ").weights)

    def test_rejects_ratios_that_do_not_sum_to_one(self):
        with self.assertRaisesRegex(ValueError, "합"):
            parse_status_mix("201=0.9,429=0.05")

    def test_rejects_zero_or_negative_ratio(self):
        for text in ("201=1,429=0", "201=1.1,429=-0.1"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_status_mix(text)

    def test_rejects_status_code_out_of_range(self):
        for text in ("99=1", "600=1"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_status_mix(text)

    def test_rejects_duplicate_code(self):
        with self.assertRaisesRegex(ValueError, "중복"):
            parse_status_mix("201=0.5,201=0.5")

    def test_rejects_empty_or_malformed_text(self):
        for text in ("", "  ", "201", "abc=1", "201=x", "201=nan", None):
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_status_mix(text)

    def test_keeps_original_text_for_reporting(self):
        self.assertEqual("201=0.9,429=0.1", parse_status_mix("201=0.9,429=0.1").text)


class PickStatusTest(unittest.TestCase):
    MIX = parse_status_mix("201=0.9,429=0.1")

    def test_picks_by_cumulative_ratio(self):
        self.assertEqual(201, pick_status(self.MIX, 0.0))
        self.assertEqual(201, pick_status(self.MIX, 0.8999))
        self.assertEqual(429, pick_status(self.MIX, 0.9))
        self.assertEqual(429, pick_status(self.MIX, 0.999999))

    def test_rejects_draw_outside_unit_interval(self):
        for draw in (-0.1, 1.0):
            with self.subTest(draw=draw), self.assertRaises(ValueError):
                pick_status(self.MIX, draw)

    def test_follows_ratios_over_many_draws(self):
        rng = random.Random(7)
        picks = [pick_status(self.MIX, rng.random()) for _ in range(20_000)]
        self.assertAlmostEqual(0.1, picks.count(429) / len(picks), delta=0.01)


class ConfigTest(unittest.TestCase):
    def test_builds_config_from_values(self):
        config = make_config(100, "201=1", 60)
        self.assertEqual((100, ((201, 1.0),), 60), (config.delay_ms, config.statuses.weights, config.retry_after_seconds))
        self.assertEqual({"delayMs": 100, "statuses": "201=1", "retryAfterSeconds": 60}, config.to_json())

    def test_rejects_invalid_delay_or_retry_after(self):
        for delay, retry in ((-1, 60), (60_001, 60), (True, 60), (1.5, 60), (100, -1), (100, 86_401), (100, "60")):
            with self.subTest(delay=delay, retry=retry), self.assertRaises(ValueError):
                make_config(delay, "201=1", retry)

    def test_update_changes_only_given_fields(self):
        current = make_config(100, "201=1", 60)
        updated = apply_config_update(current, {"delayMs": 5, "statuses": "503=1"})
        self.assertEqual({"delayMs": 5, "statuses": "503=1", "retryAfterSeconds": 60}, updated.to_json())
        self.assertEqual({"delayMs": 100, "statuses": "201=1", "retryAfterSeconds": 60}, current.to_json())

    def test_update_rejects_unknown_keys_and_invalid_values(self):
        current = make_config(100, "201=1", 60)
        for payload in ({"delay": 5}, {"delayMs": -1}, {"statuses": "201=0.5"}, ["delayMs"]):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                apply_config_update(current, payload)


class MockStateTest(unittest.TestCase):
    def test_tracks_in_flight_and_totals(self):
        state = MockState(make_config(0, "201=1", 60))
        self.assertEqual(1, state.enter(10.0))
        self.assertEqual(2, state.enter(10.5))
        state.leave(201, 11.0)
        state.leave(503, 12.0)
        self.assertEqual(
            {"total": 2, "byStatus": {"201": 1, "503": 1}, "inFlight": 0, "maxInFlight": 2,
             "firstReceivedAt": 10.0, "lastRespondedAt": 12.0},
            state.stats(),
        )

    def test_replaces_config(self):
        state = MockState(make_config(0, "201=1", 60))
        state.replace_config(make_config(5, "429=1", 30))
        self.assertEqual(5, state.config().delay_ms)


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.log_path = Path(self.directory.name) / "requests.jsonl"
        self.log = RequestLog(str(self.log_path))
        self.state = MockState(make_config(0, "201=1", 60))
        self.server = build_server("127.0.0.1", 0, self.state, self.log, random.Random(1))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.log.close()
        self.directory.cleanup()

    def request(self, method, path, body=b""):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=10)
        try:
            connection.request(method, path, body=body, headers={"Content-Type": "application/octet-stream"})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def records(self):
        return [json.loads(line) for line in self.log_path.read_text().splitlines()]

    def test_push_returns_configured_status_and_logs_record(self):
        status, _, _ = self.request("POST", "/fcm/send/loadtest-a", b"\x01\x02")
        self.assertEqual(201, status)
        [record] = self.records()
        self.assertEqual({"receivedAt", "respondedAt", "path", "status", "concurrency", "retryAfter", "bodyBytes", "body"}, set(record))
        self.assertEqual(("/fcm/send/loadtest-a", 201, 1, None, 2), (record["path"], record["status"], record["concurrency"], record["retryAfter"], record["bodyBytes"]))
        self.assertEqual(b"\x01\x02", base64.b64decode(record["body"]))
        self.assertGreaterEqual(record["respondedAt"], record["receivedAt"])

    def test_rate_limit_response_carries_retry_after(self):
        self.state.replace_config(make_config(0, "429=1", 30))
        status, headers, _ = self.request("POST", "/fcm/send/loadtest-b", b"x")
        self.assertEqual((429, "30"), (status, headers.get("Retry-After")))
        self.assertEqual(30, self.records()[0]["retryAfter"])

    def test_applies_configured_delay(self):
        self.state.replace_config(make_config(150, "201=1", 60))
        started = time.monotonic()
        self.request("POST", "/fcm/send/loadtest-c", b"x")
        self.assertGreaterEqual(time.monotonic() - started, 0.15)

    def test_counts_concurrent_requests(self):
        self.state.replace_config(make_config(1000, "201=1", 60))
        start = threading.Barrier(5)

        def send(number):
            start.wait()
            self.request("POST", f"/fcm/send/loadtest-{number}", b"x")

        threads = [threading.Thread(target=send, args=(number,)) for number in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(5, max(record["concurrency"] for record in self.records()))
        self.assertEqual(5, self.state.stats()["maxInFlight"])

    def test_stats_endpoint_reports_counts(self):
        self.request("POST", "/fcm/send/loadtest-d", b"x")
        self.request("POST", "/fcm/send/loadtest-e", b"x")
        status, _, body = self.request("GET", "/__mock/stats")
        stats = json.loads(body)
        self.assertEqual((200, 2, {"201": 2}, 0), (status, stats["total"], stats["byStatus"], stats["inFlight"]))

    def test_config_endpoint_updates_behavior(self):
        status, _, body = self.request("POST", "/__mock/config", json.dumps({"statuses": "503=1"}).encode())
        self.assertEqual((200, "503=1"), (status, json.loads(body)["statuses"]))
        self.assertEqual(503, self.request("POST", "/fcm/send/loadtest-f", b"x")[0])
        self.assertEqual("503=1", json.loads(self.request("GET", "/__mock/config")[2])["statuses"])

    def test_config_endpoint_rejects_invalid_values(self):
        for body in (json.dumps({"delayMs": -1}).encode(), b"not json"):
            with self.subTest(body=body):
                self.assertEqual(400, self.request("POST", "/__mock/config", body)[0])
        self.assertEqual("201=1", self.state.config().statuses.text)

    def test_unknown_control_path_is_not_found(self):
        self.assertEqual(404, self.request("GET", "/__mock/unknown")[0])
        self.assertEqual(404, self.request("POST", "/__mock/unknown", b"x")[0])
        self.assertEqual([], self.records() if self.log_path.exists() and self.log_path.read_text() else [])

    def test_rejects_oversized_body(self):
        status, _, _ = self.request("POST", "/fcm/send/loadtest-g", b"x" * (64 * 1024 + 1))
        self.assertEqual(413, status)


class EntryPointTest(unittest.TestCase):
    def test_rejects_invalid_statuses_with_exit_code_two(self):
        script = load_script("mock-push-server")
        errors = io.StringIO()
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stderr(errors):
            code = script.main(["--log", str(Path(directory) / "log.jsonl"), "--statuses", "201=0.5"])
        self.assertEqual(2, code)
        self.assertIn("상태 비율의 합", errors.getvalue())

    def test_invalid_environment_default_is_usage_error(self):
        script = load_script("mock-push-server")
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
            script.parse_args(["--log", "x.jsonl"], {"MOCK_DELAY_MS": "fast"})
        self.assertEqual(2, raised.exception.code)

    def test_reads_defaults_from_environment(self):
        script = load_script("mock-push-server")
        args = script.parse_args(["--log", "x.jsonl"], {"MOCK_DELAY_MS": "250", "MOCK_STATUSES": "503=1", "MOCK_RETRY_AFTER_SECONDS": "5"})
        self.assertEqual((250, "503=1", 5), (args.delay_ms, args.statuses, args.retry_after_seconds))


if __name__ == "__main__":
    unittest.main()
