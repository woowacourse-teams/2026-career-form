import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MONITORING = ROOT / "infra/monitoring"
IMAGE = "prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e"


@unittest.skipUnless(os.environ.get("RUN_MONITORING_INTEGRATION") == "1", "Explicit isolated Prometheus runtime test")
class MonitoringAlertExpressionsTest(unittest.TestCase):
    def test_alert_queries_handle_thresholds_no_traffic_and_single_provider_data(self) -> None:
        rules = []
        for path in (MONITORING / "grafana/provisioning/alerting").glob("rules*.json"):
            for group in json.loads(path.read_text(encoding="utf-8"))["groups"]:
                rules.extend(group["rules"])
        scenarios = []
        for env in ("dev", "staging", "prod"):
            selected = {rule["labels"]["kind"]: rule for rule in rules if rule["labels"].get("env") == env}
            tag = f'env="{env}"'
            for count, expected in ((2, 0), (3, 1), (4, 1)):
                values = " ".join(["0"] * 6 + [str(count)] * 5)
                scenarios.append(self._case(selected["http-5xx"], [
                    (f'http_server_requests_seconds_count{{{tag},status="500",uri="/synthetic"}}', values)
                ], expected))
                scenarios.append(self._case(selected["api-slow"], [
                    (f'http_server_requests_seconds_count{{{tag},uri="/synthetic"}}', values),
                    (f'http_server_requests_seconds_bucket{{{tag},uri="/synthetic",le="2.0"}}', "0x10"),
                ], expected))
                for provider, operation, kind, boundary in (
                    ("openai", "analysis", "openai-slow", "20.0"),
                    ("openai", "interaction", "bounded-call-slow", "5.0"),
                    ("jev", "analysis", "bounded-call-slow", "5.0"),
                ):
                    labels = f'{tag},provider="{provider}",operation="{operation}",outcome="success"'
                    scenarios.append(self._case(selected[kind], [
                        (f'career_form_external_call_seconds_count{{{labels}}}', values),
                        (f'career_form_external_call_seconds_bucket{{{labels},le="{boundary}"}}', "0x10"),
                    ], expected))
            for count, expected in ((0, 0), (1, 1), (2, 1)):
                values = " ".join(["0"] * 6 + [str(count)] * 5)
                scenarios.append(self._case(selected["llm-timeout"], [
                    (f'career_form_external_timeouts_total{{{tag},provider="openai",operation="analysis"}}', values)
                ], expected))
            scenarios.append(self._case(selected["backend-down"], [(f'up{{{tag},job="backend"}}', "1x10")], 0))
            scenarios.append(self._case(selected["backend-down"], [(f'up{{{tag},job="backend"}}', "0x10")], 1))
            scenarios.append(self._case(selected["data-gap"], [(f'up{{{tag},job="backend"}}', "1x10")], 0))
            scenarios.append(self._case(selected["data-gap"], [], 1))
            for kind in ("http-5xx", "llm-timeout", "api-slow", "openai-slow", "bounded-call-slow"):
                scenarios.append(self._case(selected[kind], [], 0))
        disk = next(rule for rule in rules if rule["labels"]["kind"] == "disk-full"
                    and rule["labels"]["instance"] == "career-monitor")
        for available, expected in ((21, 0), (20, 1), (19, 1)):
            labels = 'job="host",instance="career-monitor",mountpoint="/"'
            scenarios.append(self._case(disk, [
                (f'node_filesystem_size_bytes{{{labels}}}', "100x10"),
                (f'node_filesystem_avail_bytes{{{labels}}}', f"{available}x10"),
            ], expected))
        with tempfile.TemporaryDirectory(prefix="cf131-promql-") as directory:
            fixture = Path(directory) / "test.json"
            fixture.write_text(json.dumps({"evaluation_interval": "30s", "tests": scenarios}), encoding="utf-8")
            completed = subprocess.run(
                ("docker", "run", "--rm", "--entrypoint", "/bin/promtool", "--mount",
                 f"type=bind,src={directory},dst=/fixtures,readonly", IMAGE, "test", "rules", "/fixtures/test.json"),
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(0, completed.returncode, completed.stdout + completed.stderr)

    def _case(self, rule: dict, signals: list, expected: int) -> dict:
        query = rule["data"][0]["model"]["expr"]
        condition = rule["data"][1]["model"]["expression"]
        match = re.fullmatch(r"\$A (>=|==) ([0-9]+)", condition)
        self.assertIsNotNone(match)
        expression = f"({query}) {match[1]} bool {match[2]}"
        return {
            "name": f"{rule['uid']}-expected-{expected}", "interval": "30s",
            "input_series": [{"series": series, "values": values} for series, values in signals],
            "promql_expr_test": [{"expr": expression, "eval_time": "5m",
                                  "exp_samples": [{"labels": "{}", "value": expected}]}],
        }


if __name__ == "__main__":
    unittest.main()
