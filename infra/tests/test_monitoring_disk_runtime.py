import json
import os
import time
import unittest

from infra.tests.monitoring_disk_fixture import DiskAlertFixture, HOSTS


@unittest.skipUnless(os.environ.get("RUN_MONITORING_INTEGRATION") == "1", "Explicit isolated Grafana host disk test")
class MonitoringDiskRuntimeTest(DiskAlertFixture, unittest.TestCase):
    def setUp(self) -> None:
        type(self).available = dict.fromkeys(HOSTS, 11)
        type(self).failures = {}

    def test_missing_measurements_render_unknown_usage_without_template_errors(self) -> None:
        type(self).failures = {HOSTS[0]: "missing", HOSTS[1]: "error"}
        self._wait_failures()
        for rule in self._runtime_rules().values():
            summary = rule["alerts"][0]["annotations"]["summary"]
            self.assertNotIn("%!", summary)
            self.assertIn("측정 불가", summary)

    def test_pending_measurement_failures_preserve_state_and_start_time(self) -> None:
        self._wait_states({host: "Normal" for host in HOSTS})
        type(self).available = {HOSTS[0]: 10, HOSTS[1]: 9}
        self._wait_states({host: "Pending" for host in HOSTS})
        before = {host: rule["alerts"][0]["activeAt"] for host, rule in self._runtime_rules().items()}
        type(self).failures = {HOSTS[0]: "missing", HOSTS[1]: "error"}
        self._wait_failures()
        self.assertEqual({host: "Pending" for host in HOSTS}, self._states())
        after = {host: rule["alerts"][0]["activeAt"] for host, rule in self._runtime_rules().items()}
        self.assertEqual(before, after)
        self.assertEqual([], self.notifications)

    def test_provisioned_disk_rules_deliver_independent_firing_and_measured_recovery(self) -> None:
        registered = self._get("/api/v1/provisioning/alert-rules")
        self.assertEqual(set(HOSTS), {rule["labels"]["instance"] for rule in registered})
        for rule in registered:
            self.assertEqual("5m", rule["for"])
            self.assertNotIn("env", rule["labels"])
        self._wait_states({host: "Normal" for host in HOSTS})
        self.assertEqual([], self.notifications)
        type(self).available = {HOSTS[0]: 10, HOSTS[1]: 11}
        self._wait_states({HOSTS[0]: "Pending", HOSTS[1]: "Normal"})
        self.assertEqual([], self.notifications)
        type(self).available = dict.fromkeys(HOSTS, 11)
        self._wait_states({host: "Normal" for host in HOSTS})
        self.assertEqual([], self.notifications)
        type(self).failures = {HOSTS[0]: "missing", HOSTS[1]: "error"}
        self._wait_failures()
        self.assertEqual({host: "Normal" for host in HOSTS}, self._states())
        self.assertEqual([], self.notifications)
        type(self).failures = {}
        type(self).available = {HOSTS[0]: 10, HOSTS[1]: 9}
        started = time.monotonic()
        self._wait_states({host: "Pending" for host in HOSTS})
        self._wait_states({host: "Alerting" for host in HOSTS}, timeout=390)
        self.assertGreaterEqual(time.monotonic() - started, 300)
        self._wait_messages("firing", {HOSTS[0]: "90", HOSTS[1]: "91"})
        type(self).failures = {HOSTS[0]: "missing", HOSTS[1]: "error"}
        self._wait_failures()
        self.assertEqual({host: "Alerting" for host in HOSTS}, self._states())
        self.assertFalse(any("resolved" in json.dumps(payload).lower() for _, payload in self.notifications))
        type(self).failures = {}
        type(self).available = dict.fromkeys(HOSTS, 11)
        self._wait_states({host: "Normal" for host in HOSTS})
        self._wait_messages("resolved", dict.fromkeys(HOSTS, "89"))

    def _runtime_rules(self) -> dict:
        return {rule["labels"]["instance"]: rule
                for group in self._get("/api/prometheus/grafana/api/v1/rules")["data"]["groups"]
                for rule in group["rules"] if rule["labels"].get("instance") in HOSTS}

    def _states(self) -> dict:
        return {host: rule["alerts"][0]["state"].split()[0]
                for host, rule in self._runtime_rules().items() if rule.get("alerts")}

    def _wait_states(self, expected: dict, timeout: int = 100) -> None:
        self._wait_for(lambda: self._states() == expected, timeout, f"Expected states {expected}")

    def _wait_failures(self) -> None:
        def retained() -> bool:
            observed = self._runtime_rules()
            return all(host in observed and any(reason in alert["state"].lower().replace(" ", "")
                       for alert in observed[host].get("alerts", []))
                       for host, reason in ((HOSTS[0], "nodata"), (HOSTS[1], "error")))

        self._wait_for(retained, 100, "Expected NoData and Error KeepLast reasons")

    def _wait_messages(self, status: str, usage: dict) -> None:
        def matching() -> dict:
            return {host: payload for _, payload in tuple(self.notifications)
                    if status in json.dumps(payload).lower()
                    for host in HOSTS if host in json.dumps(payload)}

        self._wait_for(lambda: set(matching()) == set(HOSTS), 100, f"Expected {status} notifications")
        for host, payload in matching().items():
            with self.subTest(status=status, host=host):
                rendered = json.dumps(payload, ensure_ascii=False)
                self.assertIn(f"{usage[host]}%", rendered)
                self.assertIn("90%", rendered)
                self.assertIn("/d/career-form-monitoring", rendered)
                self.assertNotIn(next(other for other in HOSTS if other != host), rendered)
                self.assertNotIn("{{", rendered)

    def _wait_for(self, predicate, timeout: int, message: str) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(1)
        self.fail(f"{message}: rules={self._runtime_rules()}, notifications={self.notifications}")
