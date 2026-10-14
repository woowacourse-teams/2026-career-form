import base64
import http.server
import json
import os
import re
import tempfile
import threading
import time
import unittest
import urllib.request
from pathlib import Path

import yaml

from infra.tests.monitoring_runtime_fixture import MONITORING, MonitoringFixture


@unittest.skipUnless(os.environ.get("RUN_MONGODB_INTEGRATION") == "1", "Explicit isolated Grafana MongoDB alert test")
class MongoDBGrafanaRuntimeTest(MonitoringFixture, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory(prefix="cf207-grafana-")
        cls.root = Path(cls.workspace.name)
        cls.project = f"cf207-grafana-{os.getpid()}"
        cls.configuration = cls.root / "compose.json"
        cls.password = "synthetic-grafana-password"
        cls.environment = {**os.environ, "MONITORING_PRIVATE_IP": "127.0.0.1", "MONITORING_PUBLIC_URL": "http://localhost",
            "MONITORING_DATA_DIR": str(cls.root / "data"), "MONITORING_SECRETS_DIR": str(cls.root / "secrets")}
        cls.usage = 10
        cls.missing = False
        cls._start_receiver()
        cls._prepare_secrets()
        config = cls._central_config()
        config["services"] = {key: value for key, value in config["services"].items() if key in ("grafana", "prometheus", "loki")}
        config["services"]["grafana"]["environment"]["GF_SERVER_ROOT_URL"] = f"http://127.0.0.1:{cls.ports['grafana']}/"
        for name in config["services"]:
            directory = cls.root / "data" / name
            directory.mkdir(parents=True)
            directory.chmod(0o777)
        prometheus = cls.root / "prometheus.yaml"
        prometheus.write_text(yaml.safe_dump({"global": {"scrape_interval": "1s", "evaluation_interval": "1s"}, "rule_files": ["/etc/prometheus/mongodb-metrics.yaml"], "scrape_configs": [{
            "job_name": "synthetic", "honor_labels": True,
            "static_configs": [{"targets": [f"host.docker.internal:{cls.receiver.server_port}"]}]}]}))
        service = config["services"]["prometheus"]
        service["extra_hosts"] = ["host.docker.internal:host-gateway"]
        service["command"].append("--query.lookback-delta=35s")
        next(v for v in service["volumes"] if v["target"] == "/etc/prometheus/prometheus.yaml")["source"] = str(prometheus)
        recording = yaml.safe_load((MONITORING / "mongodb-metrics.yaml").read_text())
        incident = next(g for g in recording["groups"] if g["name"] == "career-mongodb-incidents")
        incident["interval"] = "1s"
        incident["rules"] = [r for r in incident["rules"] if "shared_db_cpu_" in r["record"]]
        for record in incident["rules"]:
            record["expr"] = record["expr"].replace("< 45", "< 2").replace(">= 600", ">= 10").replace(">= 300", ">= 10")
        rules_path = cls.root / "recording.yaml"
        rules_path.write_text(yaml.safe_dump({"groups": [incident]}))
        next(v for v in service["volumes"] if v["target"] == "/etc/prometheus/mongodb-metrics.yaml")["source"] = str(rules_path)
        cls._prepare_grafana(config)
        cls._start_stack(config)

    @classmethod
    def _prepare_grafana(cls, config):
        provisioning = cls.root / "db-provisioning"
        (provisioning / "alerting").mkdir(parents=True)
        (provisioning / "datasources").mkdir()
        (provisioning / "dashboards").mkdir()
        (provisioning / "dashboards/dashboards.yaml").write_text((MONITORING / "grafana/provisioning/dashboards/dashboards.yaml").read_text())
        for name in ("contact-points.json", "policies.json", "templates-mongodb.json"):
            value = json.loads((MONITORING / "grafana/provisioning/alerting" / name).read_text())
            if name == "policies.json":
                route = next(r for r in value["policies"][0]["routes"] if r["receiver"] == "career-db-discord")
                route.update(group_wait="1s", group_interval="1s", repeat_interval="5s")
                value["policies"][0]["routes"] = [route]
            (provisioning / "alerting" / name).write_text(json.dumps(value))
        source = json.loads((MONITORING / "grafana/provisioning/alerting/rules-mongodb-host-resources.json").read_text())
        group = source["groups"][0]
        group["interval"] = "10s"
        group["rules"] = [rule for rule in group["rules"] if rule["labels"]["kind"] == "db-cpu"]
        for rule in group["rules"]:
            rule["for"] = "0s"
            rule["keepFiringFor"] = "0s"
        (provisioning / "alerting/rules-db.json").write_text(json.dumps(source))
        datasource = yaml.safe_load((MONITORING / "grafana/provisioning/datasources/datasources.yaml").read_text())
        (provisioning / "datasources/datasources.yaml").write_text(yaml.safe_dump(datasource))
        next(v for v in config["services"]["grafana"]["volumes"] if v["target"] == "/etc/grafana/provisioning")["source"] = str(provisioning)

    @classmethod
    def _start_receiver(cls):
        cls.notifications = []

        class Receiver(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                content = "" if cls.missing else f'career:mongodb:cpu_usage{{instance="career-db"}} {cls.usage}\n'
                body = content.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; version=0.0.4")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                cls.notifications.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(204)
                self.end_headers()

            def log_message(self, *arguments):
                pass

        cls.receiver = http.server.ThreadingHTTPServer(("0.0.0.0", 0), Receiver)
        cls.addClassCleanup(cls.receiver.server_close)
        cls.addClassCleanup(cls.receiver.shutdown)
        threading.Thread(target=cls.receiver.serve_forever, daemon=True).start()

    def states(self):
        payload = self._get("/api/prometheus/grafana/api/v1/rules")
        Path("/tmp/cf207-grafana-state.json").write_text(json.dumps(payload))
        observed = {}
        for group in payload["data"]["groups"]:
            for rule in group["rules"]:
                states = [alert["state"].split()[0] for alert in rule.get("alerts", [])]
                observed[rule["labels"]["severity"]] = next((state for state in ("Alerting", "Recovering", "Pending", "Normal") if state in states), "Normal")
        return observed

    def wait_for(self, predicate, message):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(1)
        self.fail(f"{message}: states={self.states()} messages={self.notifications}")

    def test_warning_critical_hysteresis_missing_data_and_recovery_notifications(self):
        dashboard = self._get("/api/dashboards/uid/career-form-mongodb")["dashboard"]
        self.assertTrue({2, 18, 19}.issubset({p["id"] for p in dashboard["panels"]}))
        self.wait_for(lambda: self.states() == {"warning": "Normal", "critical": "Normal"}, "Initial normal")
        type(self).usage = 80
        self.wait_for(lambda: self.states().get("warning") == "Alerting", "Warning threshold inclusive")
        self.wait_for(lambda: any("[warning]" in json.dumps(m) for m in self.notifications), "Warning received")
        type(self).usage = 97
        self.wait_for(lambda: self.states().get("critical") == "Alerting", "Critical received")
        self.wait_for(lambda: any("[critical]" in json.dumps(m) for m in self.notifications), "Critical message")
        messages = [json.dumps(m, ensure_ascii=False) for m in self.notifications if "[critical]" in json.dumps(m)]
        self.assertTrue(all("[warning]" not in m and "[복구]" not in m for m in messages))
        self.assertTrue(all("/d/career-form-mongodb" in m and "from=" in m and "var-env=" in m for m in messages))
        link = re.search(r'http://[^\s"\\]+/d/career-form-mongodb[^\s"\\]+', messages[0]).group()
        token = base64.b64encode(f"admin:{self.password}".encode()).decode()
        request = urllib.request.Request(link, headers={"Authorization": f"Basic {token}"})
        with urllib.request.urlopen(request, timeout=10) as response:
            self.assertEqual(200, response.status)
        type(self).missing = True
        time.sleep(45)
        self.assertEqual("Alerting", self.states()["critical"])
        self.assertFalse(any("[복구]" in json.dumps(m, ensure_ascii=False) for m in self.notifications))
        self.assertGreaterEqual(sum("[critical]" in json.dumps(m) for m in self.notifications), 2)
        type(self).missing = False
        type(self).usage = 92
        time.sleep(25)
        self.assertEqual("Alerting", self.states()["critical"])
        type(self).usage = 70
        self.wait_for(lambda: self.states() == {"warning": "Normal", "critical": "Normal"}, "Measured recovery")
        self.wait_for(lambda: any("[복구]" in json.dumps(m, ensure_ascii=False) for m in self.notifications), "Recovery message")
