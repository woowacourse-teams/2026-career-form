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
        self.assertTrue(any(panel["type"] == "timeseries" for panel in panels))
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
            self.assertEqual("${route}", params["route"])
            self.assertEqual("${__from:date:iso}", params["from"])
            self.assertFalse(query.get("computed_columns"))
            self.assertNotIn("secureJsonData", query)
            self.assertEqual("결과 또는 계산 기준 없음", panel["fieldConfig"]["defaults"]["noValue"])
        first = {column["selector"] for column in panels[0]["targets"][0]["columns"]}
        self.assertTrue({"observed.mapping.rate", "observed.binding.rate", "observed.inputSuccess.rate",
                         "observed.retention.rate", "observed.collectedRetention.rate"}.issubset(first))
        failure = next(panel for panel in panels if panel["id"] == 5)["targets"][0]
        self.assertEqual("$.failures", failure["root_selector"])
        self.assertTrue({"cohort", "stage", "reason", "control", "count"}.issubset({column["selector"] for column in failure["columns"]}))
        self.assertTrue((ROOT / "infra/monitoring/grafana/dashboards/backend.json").is_file())

    def test_site_choices_and_series_preserve_identity_filters_and_nulls(self):
        dashboard = json.loads(DASHBOARD.read_text())
        variables = {value["name"]: value for value in dashboard["templating"]["list"]}
        site = variables["site"]
        self.assertEqual("query", site["type"])
        self.assertEqual("ALL", site["allValue"])
        query = site["query"]["infinityQuery"]
        self.assertEqual("/api/v1/quality/stats/sites", query["url"])
        self.assertEqual({"text", "value"}, {column["selector"] for column in query["columns"]})
        self.assertNotIn("site", {param["key"] for param in query["url_options"]["params"]})
        charts = [panel for panel in dashboard["panels"] if panel["type"] == "timeseries"]
        selectors = set()
        for panel in charts:
            self.assertIs(False, panel["fieldConfig"]["defaults"]["custom"]["spanNulls"])
            for target in panel["targets"]:
                self.assertEqual("timeseries", target["format"])
                self.assertIn({"selector": "time", "text": "Time", "type": "timestamp"}, target["columns"])
                self.assertIn({"selector": "series", "text": "series", "type": "string"}, target["columns"])
                selectors.update(column["selector"] for column in target["columns"])
                params = {param["key"]: param["value"] for param in target["url_options"]["params"]}
                self.assertEqual("SITE_VERSION_TREND", params["groupBy"])
        self.assertTrue({"observed.mapping.rate", "observed.binding.rate", "observed.inputSuccess.rate",
                         "observed.retention.rate", "observed.collectedRetention.rate", "reportingRate",
                         "reportedExecutions", "unobserved", "humanCollectedCoverage", "humanRetainedCoverage"}.issubset(selectors))
        detail = next(panel for panel in dashboard["panels"] if panel["id"] == 4)["targets"][0]
        columns = {column["selector"] for column in detail["columns"]}
        for stage in ("mapping", "binding", "inputSuccess", "retention", "collectedRetention"):
            self.assertTrue({f"observed.{stage}.{field}" for field in
                             ("numerator", "denominator", "sampleCount", "excludedSamples", "excludedFields", "unavailableReason")}.issubset(columns))
        site_columns = {column["selector"] for column in next(panel for panel in dashboard["panels"] if panel["id"] == 8)["targets"][0]["columns"]}
        for stage in ("mapping", "binding", "inputSuccess", "retention", "collectedRetention"):
            self.assertTrue({f"observed.{stage}.{field}" for field in
                             ("denominator", "sampleCount", "excludedSamples", "excludedFields")}.issubset(site_columns))
        self.assertTrue({"human.collected", "human.mapped", "human.written", "human.retained", "humanDenominator", "humanExecutions"}.issubset(columns))

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
                if urllib.parse.urlsplit(self.path).path == "/api/v1/quality/stats/sites":
                    body = json.dumps([{"text": "a.career.greetinghr.com", "value": "a.career.greetinghr.com"},
                                       {"text": "example.test (company-a)", "value": "example.test|company=company-a"}]).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                rows = []
                for route in ("STATIC", "GREETING", "GENERIC"):
                    rows.append({"dimension": {"environment": env, "host": host, "structure": "shape", "route": route, "version": version, "dateKst": "2030-01-01"},
                        "mappingRate": None if host == "empty.test" else 0.17, "bindingRate": 1.0, "inputSuccessRate": 1.0, "retentionRate": None,
                        "collectedRetentionRate": None, "collected": 100, "mapped": 17, "reportedMapped": 17, "bound": 17, "attempted": 17, "written": 17,
                        "retained": 0, "inputResultObserved": 17, "inputResultUnobserved": 0, "retentionObserved": 0, "retentionUnobserved": 17,
                        "observedInputSuccessRate": 1.0, "observedRetentionRate": None})
                for row in rows:
                    row["dimension"].update(site=host, siteIdentity="TENANT")
                    row["siteLabel"] = host
                    row["observed"] = {key: {"rate": value, "numerator": numerator, "denominator": denominator,
                        "sampleCount": 1, "excludedSamples": 1, "excludedFields": 0, "unavailableReason": None if value is not None else "NO_VALID_SAMPLES"}
                        for key, value, numerator, denominator in (("mapping", row["mappingRate"], 17, 100),
                            ("binding", 1.0, 17, 17), ("inputSuccess", 1.0, 17, 17), ("retention", None, 0, 0), ("collectedRetention", None, 0, 0))}
                    row.update(executionCount=2, reportedExecutions=1, reportingRate=0.5, unobserved=1,
                               humanDenominator=100, humanExecutions=1, humanCollectedCoverage=1.0,
                               humanMappedCoverage=0.17, humanWrittenCoverage=0.17, humanRetainedCoverage=None)
                if params.get("groupBy", [""])[0] == "SITE_VERSION_TREND":
                    expanded = []
                    for day in range(3):
                        for row in rows:
                            for build in ("v1", "v2"):
                                point = copy.deepcopy(row)
                                point["dimension"].update(version=build, dateKst=f"2030-01-0{day + 1}")
                                point["time"] = f"2029-12-31T15:00:00Z" if day == 0 else f"2030-01-0{day}T15:00:00Z"
                                method = {"STATIC": "회사 전용", "GREETING": "그리팅 전용", "GENERIC": "범용"}[row["dimension"]["route"]]
                                point["series"] = host + " / " + method + " / " + build
                                point["observed"]["inputSuccess"]["rate"] = (1.0, None, 0.5)[day]
                                expanded.append(point)
                    rows = expanded
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
        replacements = {"${site}": site, "${version}": version, "${structure}": "ALL", "${route}": "ALL", "${__from:date:iso}": "2030-01-01T00:00:00Z", "${__to:date:iso}": "2030-01-03T00:00:00Z"}
        for param in target["url_options"]["params"]:
            param["value"] = replacements.get(param["value"], param["value"])
        return self.call("/api/ds/query", {"from": "1893456000000", "to": "1893542400000", "queries": [target]})["results"]["A"]

    def test_backend_parser_preserves_weighted_rates_nulls_and_filters(self):
        result = self.query(2)
        self.assertNotIn("error", result, result)
        frame = result["frames"][0]
        values = {field["name"]: values for field, values in zip(frame["schema"]["fields"], frame["data"]["values"])}
        self.assertEqual([0.17] * 3, values["프로필 연결률"])
        self.assertEqual([None] * 3, values["입력 후 1초 유지율"])
        self.assertEqual([1.0] * 3, values["입력 성공률"])
        self.assertTrue(any(env == "dev" and params["site"] == ["site.synthetic.test"] and params["version"] == ["v2"] for env, params in self.requests))
        empty = self.query(2, site="empty.test", environment="prod")["frames"][0]
        self.assertEqual([None] * 3, empty["data"]["values"][next(index for index, field in enumerate(empty["schema"]["fields"]) if field["name"] == "프로필 연결률")])

    def test_series_keep_time_gaps_and_route_version_labels(self):
        result = self.query(12)
        self.assertNotIn("error", result, result)
        numeric = []
        for frame in result["frames"]:
            self.assertTrue(any(field["type"] == "time" for field in frame["schema"]["fields"]), frame)
            for field, values in zip(frame["schema"]["fields"], frame["data"]["values"]):
                if field["type"] == "number":
                    numeric.append((field, values))
        self.assertEqual(6, len(numeric), result)
        for field, values in numeric:
            self.assertEqual([1.0, None, 0.5], values)
            self.assertIn("site.synthetic.test", json.dumps(field))
        self.assertTrue(any("v1" in json.dumps(field) for field, _ in numeric))
        self.assertTrue(any("v2" in json.dumps(field) for field, _ in numeric))
        empty_retention = self.query(13)
        self.assertNotIn("error", empty_retention, empty_retention)
        for frame in empty_retention["frames"]:
            for field, values in zip(frame["schema"]["fields"], frame["data"]["values"]):
                if field["type"] == "number":
                    self.assertEqual([None, None, None], values)

    def test_site_variable_query_returns_display_names_and_exact_values(self):
        dashboard = self.call("/api/dashboards/uid/career-form-autofill-quality")["dashboard"]
        variable = next(value for value in dashboard["templating"]["list"] if value["name"] == "site")
        target = copy.deepcopy(variable["query"]["infinityQuery"])
        target["datasource"]["uid"] = "quality-dev"
        for param in target["url_options"]["params"]:
            param["value"] = {"${route}": "GREETING", "${structure}": "ALL", "${version}": "ALL",
                "${__from:date:iso}": "2030-01-01T00:00:00Z", "${__to:date:iso}": "2030-01-03T00:00:00Z"}.get(param["value"], param["value"])
        result = self.call("/api/ds/query", {"from": "1893456000000", "to": "1893628800000", "queries": [target]})["results"]["A"]
        self.assertNotIn("error", result, result)
        frame = result["frames"][0]
        values = {field["name"]: values for field, values in zip(frame["schema"]["fields"], frame["data"]["values"])}
        self.assertEqual(["a.career.greetinghr.com", "example.test|company=company-a"], values["__value"])
        self.assertEqual("example.test (company-a)", values["__text"][1])

    def test_site_table_and_daily_denominators_share_the_selected_site(self):
        site = "example.test|company=company-a"
        result = self.query(8, site=site)
        self.assertNotIn("error", result, result)
        frame = result["frames"][0]
        values = {field["name"]: values for field, values in zip(frame["schema"]["fields"], frame["data"]["values"])}
        self.assertEqual([site] * 3, values["사이트 구분"])
        daily = self.query(4, site=site)
        self.assertNotIn("error", daily, daily)
        frame = daily["frames"][0]
        values = {field["name"]: values for field, values in zip(frame["schema"]["fields"], frame["data"]["values"])}
        self.assertEqual([100] * 18, values["프로필 연결률 계산 기준 칸 수"])
        self.assertEqual([1] * 18, values["입력 성공률 포함한 실행 수"])
        self.assertTrue(any(params.get("site") == [site] for _, params in self.requests))

    def test_failures_keep_cohort_and_query_failure_is_not_empty_success(self):
        failure = self.query(5)
        self.assertNotIn("error", failure, failure)
        fields = failure["frames"][0]["schema"]["fields"]
        values = failure["frames"][0]["data"]["values"]
        self.assertEqual(["EXECUTION"], values[next(index for index, field in enumerate(fields) if field["name"] == "발생 단위")])
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
