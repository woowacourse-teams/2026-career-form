import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
MONITORING = ROOT / "infra/monitoring"
IMAGE = yaml.safe_load((MONITORING / "compose.yaml").read_text())["services"]["prometheus"]["image"]


class MongoDBMonitoringExpressionsTest(unittest.TestCase):
    def run_promtool(self, queries, series, rules=None):
        with tempfile.TemporaryDirectory(prefix="cf207-promql-") as directory:
            root = Path(directory)
            selected = MONITORING / "mongodb-metrics.yaml"
            if rules is not None:
                selected = root / "rules.yaml"
                selected.write_text(yaml.safe_dump(rules))
            fixture = {"rule_files": ["/recording.yaml"], "evaluation_interval": "30s", "tests": [{
                "interval": "30s", "input_series": series, "promql_expr_test": queries}]}
            (root / "tests.yaml").write_text(yaml.safe_dump(fixture))
            result = subprocess.run(["docker", "run", "--rm", "--entrypoint", "promtool", "-v", f"{root}:/tests:ro",
                "--mount", f"type=bind,src={selected},dst=/recording.yaml,readonly", IMAGE, "test", "rules", "/tests/tests.yaml"],
                capture_output=True, text=True, timeout=90)
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_shared_connection_use_is_not_multiplied_by_app_environment(self):
        self.run_promtool([{"expr": 'career:mongodb:connection_usage{instance="career-db"}', "eval_time": "2m",
                            "exp_samples": [{"labels": 'career:mongodb:connection_usage{instance="career-db"}', "value": 25}]}], [
            {"series": 'mongodb_ss_connections{job="mongodb",instance="career-db",conn_type="current"}', "values": "25+0x20"},
            {"series": 'mongodb_ss_connections{job="mongodb",instance="career-db",conn_type="available"}', "values": "75+0x20"},
            {"series": 'mongodb_up{job="mongodb",instance="career-db"}', "values": "1+0x20"}])

    def test_pool_use_excludes_idle_and_preserves_each_pool(self):
        queries = [{"expr": 'career:mongodb:pool_usage{env="prod",instance="app-one",pool="1"}', "eval_time": "2m",
                    "exp_samples": [{"labels": 'career:mongodb:pool_usage{env="prod",instance="app-one",pool="1"}', "value": 80}]}]
        series = [{"series": f'{name}{{job="backend",env="prod",instance="app-one",pool="1"}}', "values": value}
                  for name, value in [("career_form_mongo_pool_in_use", "8+0x20"),
                      ("career_form_mongo_pool_max", "10+0x20"), ("career_form_mongo_pool_idle", "2+0x20"),
                      ("career_form_mongo_pool_available", "1+0x20")]]
        self.run_promtool(queries, series)

    def test_low_volume_has_no_p95_and_missing_source_is_not_zero(self):
        self.run_promtool([{"expr": 'career:mongodb:command_p95{env="prod"}', "eval_time": "5m", "exp_samples": []},
                           {"expr": 'career:mongodb:connection_usage', "eval_time": "5m", "exp_samples": []}], [
            {"series": 'career_form_mongo_command_seconds_count{job="backend",env="prod",instance="app",command="find",outcome="success"}', "values": "0+1x10"}])

    def test_provisioned_alerts_use_histogram_gates_and_hysteresis(self):
        rules = [rule for path in (MONITORING / "grafana/provisioning/alerting").glob("rules-mongodb*.json")
                 for group in json.loads(path.read_text())["groups"] for rule in group["rules"]]
        self.assertTrue(rules)
        cpu = next(rule for rule in rules if rule["labels"]["kind"] == "db-cpu" and rule["labels"]["severity"] == "warning")
        self.assertEqual("KeepLast", cpu["noDataState"])
        self.assertEqual("0s", cpu["keepFiringFor"])
        condition = cpu["data"][-1]["model"]["conditions"][0]
        self.assertEqual([0.5], condition["evaluator"]["params"])
        recording = yaml.safe_load((MONITORING / "mongodb-metrics.yaml").read_text())["groups"][1]["rules"]
        bad = next(r for r in recording if r["record"].endswith("shared_db_cpu_warning_bad_since"))
        healthy = next(r for r in recording if r["record"].endswith("shared_db_cpu_warning_healthy_since"))
        self.assertIn(">= 80", bad["expr"])
        self.assertIn("<= 75", healthy["expr"])

    def test_failure_query_requires_ratio_and_absolute_failures(self):
        rules = json.loads((MONITORING / "grafana/provisioning/alerting/rules-mongodb-prod.json").read_text())["groups"][0]["rules"]
        query = next(r for r in rules if r["labels"]["kind"] == "db-command-failure" and r["labels"]["severity"] == "warning")["data"][0]["model"]["expr"]
        self.run_promtool([{"expr": query, "eval_time": "5m", "exp_samples": [
            {"labels": '{env="prod",instance="app-one"}', "value": 10}]}], [
            {"series": 'career_form_mongo_operation_seconds_count{job="backend",env="prod",instance="app-one",operation="find",outcome="failure"}', "values": "0+3x10"},
            {"series": 'career_form_mongo_operation_seconds_count{job="backend",env="prod",instance="app-one",operation="find",outcome="success"}', "values": "0+27x10"}])

    def test_stale_pool_is_unavailable_even_before_prometheus_staleness_timeout(self):
        series = [{"series": f'{name}{{job="backend",env="prod",instance="app",pool="1"}}', "values": value}
                  for name, value in [("career_form_mongo_pool_in_use", "8"),
                      ("career_form_mongo_pool_max", "10"), ("career_form_mongo_pool_available", "1")]]
        self.run_promtool([{"expr": 'career:mongodb:pool_usage{env="prod"}', "eval_time": "2m", "exp_samples": []}], series)

    def test_never_collected_target_ages_from_expected_start_instead_of_immediate_critical(self):
        rules = json.loads((MONITORING / "grafana/provisioning/alerting/rules-mongodb-host.json").read_text())["groups"][0]["rules"]
        query = next(r for r in rules if r["labels"]["kind"] == "db-metrics-gap")["data"][0]["model"]["expr"]
        self.run_promtool([{"expr": query, "eval_time": "2m", "exp_samples": [{"labels": "{}", "value": 120}]},
                           {"expr": query, "eval_time": "10m", "exp_samples": [{"labels": "{}", "value": 600}]}], [])

    def test_incident_survives_missing_data_and_recovery_band(self):
        rules = yaml.safe_load((MONITORING / "mongodb-metrics.yaml").read_text())
        group = next(g for g in rules["groups"] if g["name"] == "career-mongodb-incidents")
        selected = [r for r in group["rules"] if "shared_db_cpu_critical" in r["record"]]
        fixture = {"groups": [{"name": "incident", "interval": "30s", "rules": selected}]}
        name = "career:mongodb:incident_shared_db_cpu_critical"
        self.run_promtool([
            {"expr": name, "eval_time": "4m", "exp_samples": [{"labels": name, "value": 0}]},
            {"expr": name, "eval_time": "5m", "exp_samples": [{"labels": name, "value": 1}]},
            {"expr": name, "eval_time": "8m", "exp_samples": [{"labels": name, "value": 1}]},
            {"expr": name, "eval_time": "12m", "exp_samples": [{"labels": name, "value": 1}]},
            {"expr": name, "eval_time": "16m", "exp_samples": [{"labels": name, "value": 0}]},
        ], [{"series": 'career:mongodb:cpu_usage{instance="career-db"}',
             "values": "97+0x10 stale _ _ _ 92+0x4 70+0x14"}], fixture)

    def test_short_spike_does_not_arm_and_missing_data_restarts_recovery_clock(self):
        recording = yaml.safe_load((MONITORING / "mongodb-metrics.yaml").read_text())["groups"][1]
        name = "career:mongodb:incident_shared_db_cpu_critical"
        fixture = {"groups": [{"name": "incident", "interval": "30s", "rules": [
            r for r in recording["rules"] if "shared_db_cpu_critical" in r["record"]]}]}
        self.run_promtool([{"expr": name, "eval_time": "5m", "exp_samples": [{"labels": name, "value": 0}]}],
            [{"series": 'career:mongodb:cpu_usage{instance="career-db"}', "values": "97+0x3 70+0x10"}], fixture)
        self.run_promtool([
            {"expr": name, "eval_time": "15m", "exp_samples": [{"labels": name, "value": 1}]},
            {"expr": name, "eval_time": "16m", "exp_samples": [{"labels": name, "value": 0}]},
        ], [{"series": 'career:mongodb:cpu_usage{instance="career-db"}',
             "values": "97+0x10 70+0x7 stale _ _ 70+0x11"}], fixture)

    def test_dashboard_hides_stale_server_connection_values(self):
        dashboard = json.loads((MONITORING / "grafana/dashboards/mongodb.json").read_text())
        query = next(p for p in dashboard["panels"] if p["id"] == 5)["targets"][0]["expr"]
        self.run_promtool([{"expr": query, "eval_time": "2m", "exp_samples": []}], [
            {"series": 'mongodb_ss_connections{job="mongodb",instance="career-db",conn_type="current"}', "values": "25"},
            {"series": 'mongodb_up{job="mongodb",instance="career-db"}', "values": "1+0x5"}])

    def test_all_provisioned_alert_queries_parse_in_actual_prometheus(self):
        expressions = [rule["data"][0]["model"]["expr"]
                       for path in (MONITORING / "grafana/provisioning/alerting").glob("rules-mongodb*.json")
                       for group in json.loads(path.read_text())["groups"] for rule in group["rules"]]
        rules = {"groups": [{"name": "synthetic-queries", "rules": [
            {"record": f"cf207_query_{index}", "expr": expression} for index, expression in enumerate(expressions)]}]}
        self.run_promtool([], [], rules)
