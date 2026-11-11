import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
MONITORING = ROOT / "infra/monitoring"
ALERTING = MONITORING / "grafana/provisioning/alerting"
RULES = ALERTING / "rules-mongodb-backup.json"
DASHBOARD = MONITORING / "grafana/dashboards/mongodb.json"
README = MONITORING / "mongodb/README.md"
IMAGE = yaml.safe_load((MONITORING / "compose.yaml").read_text())["services"]["prometheus"]["image"]
LAST_SUCCESS = 'career_mongo_backup_last_success_timestamp_seconds{job="mongodb-host",instance="career-db"}'
LAST_RESULT = 'career_mongo_backup_success{job="mongodb-host",instance="career-db"}'
SIXTEEN_HOURS_OF_SAMPLES = 16 * 120


def backup_rules() -> list:
    return [rule for group in json.loads(RULES.read_text())["groups"] for rule in group["rules"]]


def rule(severity: str, comparison: str) -> dict:
    return next(item for item in backup_rules() if item["labels"]["severity"] == severity
                and threshold(item)[0] == comparison)


def expression(item: dict) -> str:
    return item["data"][0]["model"]["expr"]


def threshold(item: dict) -> tuple:
    evaluator = item["data"][1]["model"]["conditions"][0]["evaluator"]
    return evaluator["type"], evaluator["params"][0]


def firing(item: dict) -> str:
    operator = {"gt": ">", "lt": "<"}[threshold(item)[0]]
    return f"({expression(item)}) {operator} bool {threshold(item)[1]}"


def run_promtool(testcase: unittest.TestCase, queries: list, series: list, rules: dict = None) -> None:
    with tempfile.TemporaryDirectory(prefix="cf440-promql-") as directory:
        root = Path(directory)
        root.chmod(0o755)
        recording = MONITORING / "mongodb-metrics.yaml"
        if rules is not None:
            recording = root / "rules.yaml"
            recording.write_text(yaml.safe_dump(rules))
        fixture = {"rule_files": ["/recording.yaml"], "evaluation_interval": "30s", "tests": [{
            "interval": "30s", "input_series": series, "promql_expr_test": queries}]}
        (root / "tests.yaml").write_text(yaml.safe_dump(fixture))
        result = subprocess.run(["docker", "run", "--rm", "--entrypoint", "promtool", "-v", f"{root}:/tests:ro",
                                 "--mount", f"type=bind,src={recording},dst=/recording.yaml,readonly", IMAGE,
                                 "test", "rules", "/tests/tests.yaml"], capture_output=True, text=True, timeout=120)
        testcase.assertEqual(0, result.returncode, result.stdout + result.stderr)


def sample(query: str, eval_time: str, value) -> dict:
    return {"expr": query, "eval_time": eval_time, "exp_samples": [{"labels": "{}", "value": value}]}


class MongoDBBackupAlertRulesTest(unittest.TestCase):
    def test_rules_use_db_discord_route_keep_last_and_backup_panel(self):
        items = backup_rules()
        self.assertEqual({("warning", "gt", 28800), ("critical", "gt", 50400), ("warning", "lt", 1)},
                         {(item["labels"]["severity"], *threshold(item)) for item in items})
        for item in items:
            with self.subTest(uid=item["uid"]):
                self.assertLessEqual(len(item["uid"]), 40)
                self.assertEqual({"service": "mongodb-observation", "kind": "db-backup",
                                  "severity": item["labels"]["severity"], "instance": "career-db"}, item["labels"])
                self.assertEqual("KeepLast", item["noDataState"])
                self.assertEqual("KeepLast", item["execErrState"])
                self.assertFalse(item["isPaused"])
                self.assertEqual("career-form-mongodb", item["annotations"]["__dashboardUid__"])
                self.assertEqual("25", item["annotations"]["__panelId__"])
                self.assertIn("infra/mongodb/BACKUP.md", item["annotations"]["description"])
        routes = json.loads((ALERTING / "policies.json").read_text())["policies"][0]["routes"]
        self.assertIn({"receiver": "career-db-discord", "matcher": ["service", "=", "mongodb-observation"]},
                      [{"receiver": route["receiver"], "matcher": route["object_matchers"][0]} for route in routes])

    def test_last_success_age_warns_after_8_hours_and_becomes_critical_after_14_hours(self):
        warning, critical = rule("warning", "gt"), rule("critical", "gt")
        series = [{"series": LAST_SUCCESS, "values": f"3600+0x{SIXTEEN_HOURS_OF_SAMPLES}"}]
        run_promtool(self, [
            sample(expression(warning), "9h", 28800),
            sample(firing(warning), "9h", 0),
            sample(firing(warning), "9h30s", 1),
            sample(firing(critical), "9h30s", 0),
            sample(firing(critical), "15h", 0),
            sample(firing(critical), "15h30s", 1),
        ], series)

    def test_new_success_resets_the_age(self):
        warning = rule("warning", "gt")
        series = [{"series": LAST_SUCCESS, "values": f"0+0x1080 32400+0x{SIXTEEN_HOURS_OF_SAMPLES - 1080}"}]
        run_promtool(self, [
            sample(firing(warning), "8h30m", 1),
            sample(firing(warning), "9h30m", 0),
            sample(expression(warning), "9h30m", 1800),
        ], series)

    def test_metric_that_never_existed_counts_as_missing_from_expected_start(self):
        warning, critical = rule("warning", "gt"), rule("critical", "gt")
        run_promtool(self, [
            sample(firing(warning), "7h", 0),
            sample(firing(warning), "8h30m", 1),
            sample(firing(critical), "14h30m", 1),
        ], [])

    def test_short_collection_gap_keeps_age_of_last_reported_success(self):
        warning = rule("warning", "gt")
        series = [{"series": LAST_SUCCESS, "values": "3600+0x240 stale"}]
        run_promtool(self, [sample(expression(warning), "3h", 7200)], series)

    def test_failed_last_attempt_warns_and_missing_result_has_no_data(self):
        failure = rule("warning", "lt")
        run_promtool(self, [
            sample(expression(failure), "4m", 1),
            sample(firing(failure), "4m", 0),
            sample(firing(failure), "8m", 1),
        ], [{"series": LAST_RESULT, "values": "1x10 0x10"}])
        run_promtool(self, [{"expr": expression(failure), "eval_time": "5m", "exp_samples": []}], [])

    def test_dashboard_backup_panel_queries_parse_in_prometheus(self):
        dashboard = json.loads(DASHBOARD.read_text())
        panel = next(item for item in dashboard["panels"] if item["id"] == 25)
        self.assertIn("백업", panel["title"])
        queries = [target["expr"] for target in panel["targets"]]
        self.assertTrue(any("career_mongo_backup_last_success_timestamp_seconds" in query for query in queries))
        self.assertTrue(any("career_mongo_backup_success" in query for query in queries))
        self.assertTrue(any("career_mongo_backup_failure_stage" in query for query in queries))
        self.assertEqual(len(dashboard["panels"]), len({item["id"] for item in dashboard["panels"]}))
        run_promtool(self, [], [], {"groups": [{"name": "backup-panel", "rules": [
            {"record": f"cf440_panel_{index}", "expr": query} for index, query in enumerate(queries)]}]})

    def test_readme_alert_table_has_backup_row(self):
        text = README.read_text()
        self.assertIn("| 백업 | 마지막 성공 8시간 초과 또는 마지막 시도 실패 | 마지막 성공 14시간 초과 |", text)
        self.assertIn("rules-mongodb-backup.json", text)
        self.assertIn("infra/mongodb/BACKUP.md", text)


if __name__ == "__main__":
    unittest.main()
