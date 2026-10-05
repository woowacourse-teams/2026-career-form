import base64
import json
import os
import subprocess
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

from infra.tests.monitoring_runtime_fixture import MonitoringFixture, ROOT


@unittest.skipUnless(os.environ.get("RUN_MONITORING_INTEGRATION") == "1", "Isolated diagnostics stack")
class MonitoringDiagnosticsRuntimeTest(MonitoringFixture, unittest.TestCase):
    def setUp(self) -> None:
        dashboard = self._get("/api/dashboards/uid/career-form-monitoring")["dashboard"]
        self.panels = {panel["id"]: panel for panel in dashboard["panels"]}
        self.request_id = "11111111-1111-4111-8111-111111111111"
        self.other_id = "22222222-2222-4222-8222-222222222222"

    def _push(self, lines: list[str], env: str = "dev") -> None:
        token = base64.b64encode(f"synthetic:{self.password}".encode()).decode()
        timestamp = time.time_ns()
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.ports['loki']}/loki/api/v1/push",
            data=json.dumps({"streams": [{"stream": {
                "env": env, "service": "career-form-backend", "instance": "diagnostics-fixture"},
                "values": [[str(timestamp + index), line] for index, line in enumerate(lines)]}]}).encode(),
            headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            self.assertEqual(204, response.status)

    def _query(self, panel_id: int, request_id: str = "", status: str = "") -> list[str]:
        self.assertIn(panel_id, self.panels, "Required diagnostics panel is not provisioned")
        panel = self.panels[panel_id]
        expression = panel["targets"][0]["expr"]
        for key, value in {"env": "dev", "requestId": request_id, "status": status}.items():
            expression = expression.replace("${" + key + ":regex}", value).replace("$" + key, value)
        params = urllib.parse.urlencode({"query": expression, "start": time.time_ns() - 60_000_000_000,
            "end": time.time_ns() + 1_000_000_000, "limit": panel["targets"][0].get("maxLines", 500),
            "direction": "forward" if panel["options"].get("sortOrder") == "Ascending" else "backward"})
        result = self._get("/api/datasources/proxy/uid/loki/loki/api/v1/query_range?" + params)
        return [value[1] for stream in result["data"]["result"] for value in stream["values"]]

    def _api(self, route: str, duration: int, status: int = 200, request_id: str | None = None) -> str:
        return (f"2026-10-05 INFO [requestId={request_id or self.request_id}] test : API_RESULT "
            f"env=dev service=career-form-backend method=POST route={route} status={status} "
            f"durationMs={duration} requestId={request_id or self.request_id} failure=none")

    def test_server_errors_and_status_selection_exclude_other_codes_and_environments(self) -> None:
        self._push([self._api("/synthetic/errors", 30, code) for code in (200, 302, 400, 500, 503)])
        self._push([self._api("/synthetic/errors", 30, 502)], "prod")
        self.assertEqual(2, len([line for line in self._query(14) if "route=/synthetic/errors " in line]))
        selected = [line for line in self._query(21, status="400") if "route=/synthetic/errors " in line]
        self.assertEqual(1, len(selected))
        self.assertIn("status=400", selected[0])
        self.assertEqual([], self._query(21))

    def test_slow_requests_use_strict_route_thresholds_and_skip_actuator(self) -> None:
        scenarios = [("/api/v1/preparation/analyze", 20000), ("/api/v1/fields/analyze", 20000),
            ("/api/v1/generic/interaction-decisions", 5000), ("/synthetic/other", 2000)]
        self._push([self._api(route, duration + delta) for route, duration in scenarios for delta in (0, 1)]
            + [self._api("/actuator/health", 30000)])
        result = self._query(15)
        for route, duration in scenarios:
            matching = [line for line in result if f"route={route} " in line]
            self.assertEqual(1, len(matching), matching)
            self.assertIn(f"durationMs={duration + 1}", matching[0])
        self.assertFalse(any("route=/actuator/" in line for line in result))

    def test_external_failures_do_not_include_success(self) -> None:
        self._push([f"INFO test : EXTERNAL_RESULT provider=jev operation=analysis outcome={outcome} "
            f"durationMs=100 requestId={self.request_id}" for outcome in ("success", "failure", "timeout")])
        result = self._query(16)
        self.assertTrue(any("outcome=failure" in line for line in result))
        self.assertTrue(any("outcome=timeout" in line for line in result))
        self.assertFalse(any("outcome=success" in line for line in result))

    def test_related_request_keeps_success_and_safe_errors_but_never_other_ids(self) -> None:
        first = self._api("/synthetic/related", 50, 500)
        success = f"INFO [requestId={self.request_id}] EXTERNAL_RESULT provider=jev outcome=success"
        error = f"WARN [requestId={self.request_id}] synthetic-safe-error"
        self._push([first, success, error, self._api("/synthetic/related", 50, 500, self.other_id),
            "INFO requestId=none synthetic-no-context", "INFO synthetic-no-context"])
        result = self._query(20, self.request_id)
        self.assertIn(first, result)
        self.assertIn(success, result)
        self.assertIn(error, result)
        self.assertLess(result.index(first), result.index(success))
        self.assertFalse(any(self.other_id in line for line in result))
        self.assertEqual([], self._query(20))
        self.assertEqual([], self._query(20, "not-a-uuid"))

    def test_malformed_numeric_log_is_excluded_and_reported_without_query_failure(self) -> None:
        self._push(["INFO API_RESULT route=/synthetic/malformed status=500 durationMs=invalid requestId=none"])
        self.assertFalse(any("/synthetic/malformed" in line for line in self._query(15)))
        self.assertTrue(any("/synthetic/malformed" in line for line in self._query(24)))

    def test_related_logs_enforce_line_limit(self) -> None:
        request_id = "33333333-3333-4333-8333-333333333333"
        self._push([f"INFO [requestId={request_id}] synthetic-line-{index}" for index in range(505)])
        self.assertEqual(500, len(self._query(20, request_id)))

    def test_invalid_query_remains_an_error_instead_of_empty_success(self) -> None:
        query = urllib.parse.urlencode({"query": "invalid-query", "start": time.time_ns() - 1_000_000_000,
                                       "end": time.time_ns()})
        with self.assertRaises(urllib.error.HTTPError):
            self._get("/api/datasources/proxy/uid/loki/loki/api/v1/query_range?" + query)

    @unittest.skipUnless(os.environ.get("MONITORING_PLAYWRIGHT_MODULE"), "Explicit browser dependency path")
    def test_browser_request_links_preserve_environment_time_and_reset_filters(self) -> None:
        request_id = "44444444-4444-4444-8444-444444444444"
        self._push([self._api("/synthetic/browser", 50, 500, request_id),
            f"INFO [requestId={request_id}] EXTERNAL_RESULT provider=jev operation=analysis outcome=success durationMs=40"])
        config = {"url": self.public_url, "password": self.password, "requestId": request_id}
        completed = subprocess.run(("node", str(ROOT / "infra/tests/monitoring_diagnostics_browser.cjs"),
            json.dumps(config)), capture_output=True, text=True, timeout=90, check=False)
        self.assertEqual(0, completed.returncode, completed.stdout + completed.stderr)
