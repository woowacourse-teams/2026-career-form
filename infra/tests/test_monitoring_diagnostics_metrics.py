import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from infra.tests.test_monitoring_alert_expressions import IMAGE, MONITORING


@unittest.skipUnless(os.environ.get("RUN_MONITORING_INTEGRATION") == "1", "Isolated Prometheus query evaluation")
class MonitoringDiagnosticsMetricsTest(unittest.TestCase):
    def test_dashboard_queries_separate_status_outcomes_providers_and_sample_states(self) -> None:
        panels = {panel["id"]: panel for panel in json.loads(
            (MONITORING / "grafana/dashboards/backend.json").read_text())["panels"]}
        for panel_id in (13, 17, 18, 19, 22):
            self.assertIn(panel_id, panels, "Required metric panel is missing")

        def query(panel_id: int) -> str:
            return panels[panel_id]["targets"][0]["expr"].replace("$env", "dev")

        statuses = [{"series": f'http_server_requests_seconds_count{{env="dev",uri="{uri}",status="{code}"}}',
                     "values": "0+1x30"}
                    for uri, code in (("/synthetic", "200"), ("/synthetic", "302"), ("/synthetic", "400"),
                                      ("/synthetic", "500"), ("/actuator/health", "503"))]
        scenarios = [{"interval": "30s", "input_series": statuses, "promql_expr_test": [{
            "expr": query(13), "eval_time": "15m", "exp_samples": [
                {"labels": '{status="302"}', "value": 10}, {"labels": '{status="400"}', "value": 10},
                {"labels": '{status="500"}', "value": 10}]}]}]
        for count, expected in ((0, 0), (19, 1), (20, 2)):
            label = 'env="dev",provider="openai",operation="analysis",outcome="success"'
            scenarios.append({"interval": "30s", "input_series": [{
                "series": f'career_form_external_call_seconds_count{{{label}}}',
                "values": f"0x29 {count}"}], "promql_expr_test": [{"expr": query(19), "eval_time": "15m",
                    "exp_samples": [{"labels": '{operation="analysis",provider="openai"}', "value": expected}]}]})
        for provider, latency in (("openai", 2), ("jev", 4)):
            label = f'env="dev",provider="{provider}",operation="analysis",outcome="success"'
            signals = [{"series": f'career_form_external_call_seconds_count{{{label}}}', "values": "0+1x30"}]
            signals += [{"series": f'career_form_external_call_seconds_bucket{{{label},le="{bound}"}}',
                         "values": "0+1x30"} for bound in (str(latency), "+Inf")]
            signals += [{"series": 'career_form_external_call_seconds_bucket{env="dev",provider="openai",'
                         'operation="analysis",outcome="timeout",le="60"}', "values": "0+100x30"}]
            scenarios.append({"interval": "30s", "input_series": signals, "promql_expr_test": [{
                "expr": query(17), "eval_time": "15m", "exp_samples": [{
                    "labels": f'{{operation="analysis",provider="{provider}"}}', "value": latency * .95}]}]})
        scenarios.append({"interval": "30s", "input_series": [{
            "series": 'career_form_external_call_seconds_count{env="dev",provider="jev",operation="analysis",outcome="failure"}',
            "values": "0+1x30"}], "promql_expr_test": [
                {"expr": query(17), "eval_time": "15m", "exp_samples": []},
                {"expr": query(19), "eval_time": "15m", "exp_samples": [{
                    "labels": '{operation="analysis",provider="jev"}', "value": 0}]},
                {"expr": query(18), "eval_time": "15m", "exp_samples": [{
                    "labels": '{operation="analysis",outcome="failure",provider="jev"}', "value": 30}]}]})
        scenarios.append({"interval": "30s", "input_series": [], "promql_expr_test": [
            {"expr": query(17), "eval_time": "15m", "exp_samples": []},
            {"expr": query(22), "eval_time": "15m", "exp_samples": [{"labels": "{}", "value": 0}]}]})
        for up in (0, 1):
            scenarios.append({"interval": "30s", "input_series": [{
                "series": 'up{env="dev",job="backend",instance="synthetic"}', "values": f"{up}x30"}],
                "promql_expr_test": [{"expr": query(22), "eval_time": "15m",
                                     "exp_samples": [{"labels": "{}", "value": up}]}]})
        with tempfile.TemporaryDirectory(prefix="cf158-promql-") as directory:
            fixture = Path(directory) / "test.json"
            fixture.write_text(json.dumps({"evaluation_interval": "30s", "fuzzy_compare": True, "tests": scenarios}))
            completed = subprocess.run(("docker", "run", "--rm", "--entrypoint", "/bin/promtool", "--mount",
                f"type=bind,src={directory},dst=/fixtures,readonly", IMAGE, "test", "rules", "/fixtures/test.json"),
                capture_output=True, text=True, check=False)
            self.assertEqual(0, completed.returncode, completed.stdout + completed.stderr)
