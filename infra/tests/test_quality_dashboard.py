import json
import base64
import copy
import http.server
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DASHBOARD = ROOT / "infra/monitoring/grafana/dashboards/autofill-quality.json"


class QualityDashboardContractTest(unittest.TestCase):
    def test_queries_preserve_filtered_counts_nulls_and_separate_failure_cohorts(self):
        dashboard = json.loads(DASHBOARD.read_text())
        panels = [panel for panel in dashboard["panels"] if panel.get("targets")]
        self.assertEqual(["ROUTE", "ROUTE", "VERSION_TREND", "FULL", "ROUTE", "ROUTE"],
                         [next(value["value"] for value in panel["targets"][0]["url_options"]["params"] if value["key"] == "groupBy") for panel in panels])
        for panel in panels:
            query = panel["targets"][0]
            self.assertEqual("backend", query["parser"])
            self.assertEqual("url", query["source"])
            self.assertEqual("/api/v1/quality/stats", query["url"])
            self.assertEqual("${environment}", query["datasource"]["uid"])
            params = {value["key"]: value["value"] for value in query["url_options"]["params"]}
            self.assertEqual("${site}", params["site"])
            self.assertEqual("${version}", params["version"])
            self.assertEqual("${structure}", params["structure"])
            self.assertEqual("${__from:date:iso}", params["from"])
            self.assertFalse(query.get("computed_columns"))
            self.assertNotIn("secureJsonData", query)
            self.assertEqual("미관측 또는 분모 없음", panel["fieldConfig"]["defaults"]["noValue"])
        first = {column["selector"] for column in panels[0]["targets"][0]["columns"]}
        self.assertTrue({"mappingRate", "inputSuccessRate", "retentionRate", "collected", "mapped", "attempted", "written"}.issubset(first))
        self.assertEqual("$.failures", panels[3]["targets"][0]["root_selector"])
        self.assertTrue({"cohort", "stage", "reason", "control", "count"}.issubset({column["selector"] for column in panels[3]["targets"][0]["columns"]}))
        self.assertTrue((ROOT / "infra/monitoring/grafana/dashboards/backend.json").is_file())

    def test_plugin_pin_and_readonly_provisioning_have_no_shared_manager_password(self):
        configuration = (ROOT / "infra/monitoring/compose.yaml").read_text()
        self.assertIn('GF_PLUGINS_PREINSTALL_SYNC: "yesoreyeram-infinity-datasource@4.1.1"', configuration)
        datasources = json.loads((ROOT / "infra/monitoring/grafana/provisioning/datasources/quality.yaml").read_text())
        self.assertEqual(3, len(datasources["datasources"]))
        for datasource in datasources["datasources"]:
            self.assertFalse(datasource["editable"])
            self.assertEqual("bearerToken", datasource["jsonData"]["auth_method"])
            self.assertEqual([datasource["url"]], datasource["jsonData"]["allowedHosts"])
            self.assertIn("_QUERY_TOKEN}", datasource["secureJsonData"]["bearerToken"])
            self.assertNotIn("password", json.dumps(datasource).lower())


@unittest.skipUnless(os.environ.get("RUN_QUALITY_DASHBOARD_INTEGRATION") == "1", "Isolated Grafana and synthetic quality API")
class QualityDashboardRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory(prefix="cf164-quality-grafana-")
        cls.addClassCleanup(cls.workspace.cleanup)
        cls.root = Path(cls.workspace.name)
        cls.requests = []

        class Receiver(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                params = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                authorization = self.headers.get("Authorization", "")
                env = next((value for value in ("dev", "staging", "prod") if authorization == "Bearer synthetic-quality-" + value + "-token"), None)
                if env is None:
                    self.send_response(401)
                    self.end_headers()
                    return
                cls.requests.append((env, params))
                host = params.get("site", ["ALL"])[0]
                version = params.get("version", ["ALL"])[0]
                if host == "too-wide":
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b'{"error":"NARROW_OR_CORRECT_FILTERS"}')
                    return
                rows = []
                for route in ("STATIC", "GREETING", "GENERIC"):
                    rows.append({"dimension": {"environment": env, "host": host, "structure": "shape", "route": route, "version": version, "dateKst": "2030-01-01"},
                        "mappingRate": None if host == "empty.test" else 0.17, "bindingRate": 1.0, "inputSuccessRate": 1.0, "retentionRate": None,
                        "collectedRetentionRate": None, "collected": 100, "mapped": 17, "reportedMapped": 17, "bound": 17, "attempted": 17, "written": 17,
                        "retained": 0, "inputResultObserved": 17, "inputResultUnobserved": 0, "retentionObserved": 0, "retentionUnobserved": 17,
                        "observedInputSuccessRate": 1.0, "observedRetentionRate": None})
                body = json.dumps({"rows": rows, "failures": [{"dimension": rows[0]["dimension"], "cohort": "EXECUTION", "stage": "RETENTION",
                    "reason": "RETENTION_UNOBSERVED", "control": "TEXT", "count": 17}]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format, *args):
                pass

        cls.receiver = http.server.ThreadingHTTPServer(("0.0.0.0", 0), Receiver)
        cls.addClassCleanup(cls.receiver.server_close)
        cls.addClassCleanup(cls.receiver.shutdown)
        threading.Thread(target=cls.receiver.serve_forever, daemon=True).start()
        provisioning = cls.root / "provisioning"
        shutil.copytree(ROOT / "infra/monitoring/grafana/provisioning", provisioning)
        shutil.rmtree(provisioning / "alerting")
        (provisioning / "datasources/datasources.yaml").unlink()
        datasources = json.loads((provisioning / "datasources/quality.yaml").read_text())
        for datasource in datasources["datasources"]:
            env = datasource["uid"].removeprefix("quality-")
            datasource["url"] = f"http://host.docker.internal:{cls.receiver.server_port}"
            datasource["jsonData"]["allowedHosts"] = [datasource["url"]]
            datasource["secureJsonData"]["bearerToken"] = "synthetic-quality-" + env + "-token"
        unconfigured = copy.deepcopy(datasources["datasources"][0])
        unconfigured.update(name="Quality unconfigured", uid="quality-unconfigured", url="${QUALITY_UNCONFIGURED_API_ORIGIN}")
        unconfigured["jsonData"]["allowedHosts"] = ["${QUALITY_UNCONFIGURED_API_ORIGIN}"]
        unconfigured["secureJsonData"]["bearerToken"] = "${QUALITY_UNCONFIGURED_QUERY_TOKEN}"
        datasources["datasources"].append(unconfigured)
        (provisioning / "datasources/quality.yaml").write_text(json.dumps(datasources))
        shutil.copytree(ROOT / "infra/monitoring/grafana/dashboards", cls.root / "dashboards")
        cls.container = "cf164-quality-grafana-" + str(os.getpid())
        cls.addClassCleanup(lambda: subprocess.run(("docker", "stop", cls.container), capture_output=True, check=False))
        subprocess.run(("docker", "run", "--rm", "-d", "--name", cls.container, "--platform", "linux/arm64", "--memory", "512m",
            "-p", "127.0.0.1::3000", "--add-host", "host.docker.internal:host-gateway", "-e", "GF_SECURITY_ADMIN_PASSWORD=synthetic-grafana-only",
            "-e", "GF_PLUGINS_PREINSTALL=", "-e", "GF_PLUGINS_PREINSTALL_SYNC=yesoreyeram-infinity-datasource@4.1.1",
            "-v", str(provisioning) + ":/etc/grafana/provisioning:ro", "-v", str(cls.root / "dashboards") + ":/etc/grafana/dashboards:ro",
            "grafana/grafana:13.2.3@sha256:b28bae15e219c998fb0e0424ed724930cc61b1f61fb404d47c862f9a23f9e572"), check=True, capture_output=True)
        port = subprocess.check_output(("docker", "port", cls.container, "3000/tcp"), text=True).strip().rsplit(":", 1)[1]
        cls.url = "http://127.0.0.1:" + port
        deadline = time.monotonic() + 150
        while time.monotonic() < deadline:
            try:
                cls.call("/api/dashboards/uid/career-form-autofill-quality")
                return
            except OSError:
                threading.Event().wait(0.2)
        raise AssertionError(subprocess.check_output(("docker", "logs", cls.container), stderr=subprocess.STDOUT, text=True))

    @classmethod
    def call(cls, path, body=None):
        authorization = base64.b64encode(b"admin:synthetic-grafana-only").decode()
        request = urllib.request.Request(cls.url + path, data=None if body is None else json.dumps(body).encode(),
            headers={"Authorization": "Basic " + authorization, "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)

    def query(self, panel_id, site="site.synthetic.test", version="v2", environment="dev"):
        dashboard = self.call("/api/dashboards/uid/career-form-autofill-quality")["dashboard"]
        target = copy.deepcopy(next(panel for panel in dashboard["panels"] if panel["id"] == panel_id)["targets"][0])
        target["datasource"]["uid"] = "quality-" + environment
        replacements = {"${site}": site, "${version}": version, "${structure}": "ALL", "${__from:date:iso}": "2030-01-01T00:00:00Z", "${__to:date:iso}": "2030-01-02T00:00:00Z"}
        for param in target["url_options"]["params"]:
            param["value"] = replacements.get(param["value"], param["value"])
        return self.call("/api/ds/query", {"from": "1893456000000", "to": "1893542400000", "queries": [target]})["results"]["A"]

    def test_backend_parser_preserves_weighted_rates_nulls_and_filters(self):
        result = self.query(2)
        self.assertNotIn("error", result, result)
        frame = result["frames"][0]
        values = {field["name"]: values for field, values in zip(frame["schema"]["fields"], frame["data"]["values"])}
        self.assertEqual([0.17] * 3, values["매핑률"])
        self.assertEqual([None] * 3, values["1초 유지율"])
        self.assertEqual([100] * 3, values["요청 수집 후보"])
        self.assertEqual([17] * 3, values["입력 시도 칸"])
        self.assertTrue(any(env == "dev" and params["site"] == ["site.synthetic.test"] and params["version"] == ["v2"] for env, params in self.requests))
        empty = self.query(2, site="empty.test", environment="prod")["frames"][0]
        self.assertEqual([None] * 3, empty["data"]["values"][next(index for index, field in enumerate(empty["schema"]["fields"]) if field["name"] == "매핑률")])

    def test_failures_keep_cohort_and_query_failure_is_not_empty_success(self):
        failure = self.query(5)
        self.assertNotIn("error", failure, failure)
        fields = failure["frames"][0]["schema"]["fields"]
        values = failure["frames"][0]["data"]["values"]
        self.assertEqual(["EXECUTION"], values[next(index for index, field in enumerate(fields) if field["name"] == "관측 단위")])
        import urllib.error
        try:
            rejected = self.query(2, site="too-wide")
            self.assertTrue(rejected.get("error"), rejected)
        except urllib.error.HTTPError as error:
            self.assertIn(error.code, (400, 500))

    def test_plugin_and_existing_dashboard_are_provisioned_without_token_disclosure(self):
        self.assertEqual("4.1.1", self.call("/api/plugins/yesoreyeram-infinity-datasource/settings")["info"]["version"])
        self.assertTrue(self.call("/api/dashboards/uid/career-form-monitoring")["dashboard"]["panels"])
        datasource = self.call("/api/datasources/uid/quality-dev")
        self.assertTrue(datasource["secureJsonFields"]["bearerToken"])
        self.assertNotIn("synthetic-quality-dev-token", json.dumps(datasource))
        self.assertEqual("", self.call("/api/datasources/uid/quality-unconfigured")["url"])
