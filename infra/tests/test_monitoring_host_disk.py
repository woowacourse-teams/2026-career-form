import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

from infra.tests.test_monitoring_alert_expressions import IMAGE, MONITORING


def disk_rule_entries() -> list:
    return [
        (group, rule)
        for path in (MONITORING / "grafana/provisioning/alerting").glob("rules*.json")
        for group in json.loads(path.read_text(encoding="utf-8"))["groups"]
        for rule in group["rules"]
        if rule["labels"].get("kind") == "disk-full"
    ]


def disk_rules() -> dict:
    return {rule["labels"]["instance"]: (group, rule) for group, rule in disk_rule_entries()}


class MonitoringHostDiskTest(unittest.TestCase):
    def test_root_disk_rules_cover_three_distinct_hosts_without_app_environment(self) -> None:
        selected = disk_rules()
        self.assertEqual({"career-monitor", "career-dev-staging", "career-prod"}, set(selected))
        self.assertEqual(3, len(disk_rule_entries()), "같은 호스트를 중복 평가하는 디스크 규칙이 없어야 합니다")
        for host in ("career-dev-staging", "career-prod"):
            group, rule = selected[host]
            with self.subTest(host=host):
                self.assertNotIn("env", rule["labels"])
                self.assertEqual("30s", group["interval"])
                self.assertEqual("5m", rule["for"])
                self.assertEqual("KeepLast", rule["noDataState"])
                self.assertEqual("KeepLast", rule["execErrState"])
                self.assertFalse(rule["isPaused"])
                self.assertEqual("B", rule["condition"])
                self.assertEqual("$A >= 90", rule["data"][1]["model"]["expression"])

    def test_host_disk_notifications_are_grouped_by_host_on_existing_receiver(self) -> None:
        policy = json.loads((MONITORING / "grafana/provisioning/alerting/policies.json").read_text())["policies"][0]
        route = next((entry for entry in policy.get("routes", [])
                      if ["service", "=", "host"] in entry.get("object_matchers", [])), None)
        self.assertIsNotNone(route, "호스트 알림을 instance별로 분리하는 route가 필요합니다")
        self.assertIn("instance", route["group_by"])
        self.assertEqual("career-discord", route["receiver"])
        self.assertEqual("10m", policy["repeat_interval"])
        contact = json.loads((MONITORING / "grafana/provisioning/alerting/contact-points.json").read_text())
        receiver = contact["contactPoints"][0]["receivers"][0]
        self.assertEqual("career-discord", receiver["uid"])
        self.assertFalse(receiver["disableResolveMessage"])


@unittest.skipUnless(os.environ.get("RUN_MONITORING_INTEGRATION") == "1", "Explicit isolated promtool disk test")
class MonitoringHostDiskExpressionsTest(unittest.TestCase):
    def test_actual_queries_and_pending_period_handle_boundaries_spikes_and_recovery(self) -> None:
        with tempfile.TemporaryDirectory(prefix="cf144-disk-promql-") as directory:
            root = Path(directory)
            selected = disk_rules()
            self.assertEqual({"career-monitor", "career-dev-staging", "career-prod"}, set(selected))
            for host, (group, rule) in selected.items():
                with self.subTest(host=host):
                    threshold = 80 if host == "career-monitor" else 90
                    self._verify_rule(root, host, group, rule, threshold)

    def _verify_rule(self, root: Path, host: str, group: dict, rule: dict, threshold: int) -> None:
        match = re.fullmatch(r"\$A (>=|==) ([0-9]+)", rule["data"][1]["model"]["expression"])
        self.assertIsNotNone(match)
        query = rule["data"][0]["model"]["expr"]
        expression = f"({query}) {match[1]} {match[2]}"
        (root / "rules.json").write_text(json.dumps({"groups": [{
            "name": rule["uid"], "interval": group["interval"],
            "rules": [{"alert": rule["uid"], "expr": expression, "for": rule["for"]}],
        }]}), encoding="utf-8")
        cases = [self._case(host, rule, query, threshold, available) for available in
                 (101 - threshold, 100 - threshold, 99 - threshold)]
        cases.append(self._case(host, rule, query, threshold, 100 - threshold,
                                " ".join([str(100 - threshold)] * 10 + ["50"] * 5)))
        cases.append(self._case(host, rule, query, threshold, 99 - threshold,
                                " ".join([str(99 - threshold)] * 11 + ["50"] * 4)))
        cases.append({"interval": "30s", "input_series": [], "promql_expr_test": [
            {"expr": query, "eval_time": "5m", "exp_samples": []}],
            "alert_rule_test": [{"eval_time": "6m", "alertname": rule["uid"], "exp_alerts": []}]})
        (root / "test.json").write_text(json.dumps({"rule_files": ["rules.json"],
            "evaluation_interval": "30s", "tests": cases}), encoding="utf-8")
        completed = subprocess.run(("docker", "run", "--rm", "--entrypoint", "/bin/promtool", "--mount",
            f"type=bind,src={root},dst=/fixtures,readonly", "--workdir", "/fixtures",
            IMAGE, "test", "rules", "test.json"), capture_output=True, text=True, check=False)
        self.assertEqual(0, completed.returncode, completed.stdout + completed.stderr)

    def _case(self, host: str, rule: dict, query: str, threshold: int,
              available: int, values: str | None = None) -> dict:
        labels = f'job="host",instance="{host}",mountpoint="/"'
        signals = [
            {"series": f'node_filesystem_size_bytes{{{labels}}}', "values": "100x14"},
            {"series": f'node_filesystem_avail_bytes{{{labels}}}', "values": values or f"{available}x14"},
        ]
        for extra in (f'job="host",instance="{host}",mountpoint="/data"',
                      'job="host",instance="other-host",mountpoint="/"'):
            signals.extend([
                {"series": f'node_filesystem_size_bytes{{{extra}}}', "values": "100x14"},
                {"series": f'node_filesystem_avail_bytes{{{extra}}}', "values": "1x14"},
            ])
        firing = [{"exp_labels": {}, "exp_annotations": {}}] if 100 - available >= threshold else []
        return {"interval": "30s", "input_series": signals,
            "promql_expr_test": [{"expr": query, "eval_time": "0s",
                                  "exp_samples": [{"labels": "{}", "value": 100 - available}]}],
            "alert_rule_test": [
                {"eval_time": "4m30s", "alertname": rule["uid"], "exp_alerts": []},
                {"eval_time": "5m", "alertname": rule["uid"],
                 "exp_alerts": [] if values and values.split()[10] == "50" else firing},
                {"eval_time": "6m", "alertname": rule["uid"], "exp_alerts": [] if values else firing},
            ]}
