import base64
import json
import os
import subprocess
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

from infra.tests.monitoring_runtime_fixture import MonitoringFixture


@unittest.skipUnless(os.environ.get("RUN_MONITORING_INTEGRATION") == "1",
                     "Run explicitly against isolated local Docker with synthetic data")
class MonitoringRuntimeTest(MonitoringFixture, unittest.TestCase):
    def test_provisioned_dashboard_and_datasources_are_available(self) -> None:
        sources = self._get("/api/datasources")
        self.assertEqual({"loki", "prometheus"}, {entry["uid"] for entry in sources})
        dashboard = self._get("/api/dashboards/uid/career-form-monitoring")
        self.assertEqual("career-form-monitoring", dashboard["dashboard"]["uid"])
        selected = next(entry for entry in dashboard["dashboard"]["templating"]["list"]
                        if entry["name"] == "env")
        self.assertEqual("dev,staging,prod", selected["query"])

    def test_ingest_requires_authentication_and_does_not_expose_queries(self) -> None:
        base = f"http://127.0.0.1:{self.ports['loki']}"
        payload = json.dumps({"streams": []}).encode()
        with self.assertRaises(urllib.error.HTTPError) as missing:
            urllib.request.urlopen(urllib.request.Request(
                base + "/loki/api/v1/push", data=payload,
                headers={"Content-Type": "application/json"},
            ), timeout=5)
        self.assertEqual(401, missing.exception.code)
        missing.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as hidden:
            urllib.request.urlopen(base + "/loki/api/v1/query", timeout=5)
        self.assertEqual(404, hidden.exception.code)
        hidden.exception.close()

    def test_ingest_follows_replaced_loki_container_with_changed_private_address(self) -> None:
        network = f"{self.project}_default"
        inspected = subprocess.check_output(
            ("docker", "inspect", f"{self.project}-loki-1", "--format", "{{json .NetworkSettings.Networks}}"), text=True,
        )
        old_address = json.loads(inspected)[network]["IPAddress"]
        self.assertEqual(0, self._compose("stop", "loki").returncode)
        self.assertEqual(0, self._compose("rm", "-f", "loki").returncode)
        holder = f"{self.project}-synthetic-address-holder"
        image = json.loads(self.configuration.read_text())["services"]["ingest"]["image"]
        try:
            subprocess.run(("docker", "run", "-d", "--name", holder, "--network", network, "--ip", old_address,
                            "--entrypoint", "sleep", image, "120"), check=True, capture_output=True)
            self.assertEqual(0, self._compose("up", "-d", "loki").returncode)
            token = base64.b64encode(f"synthetic:{self.password}".encode()).decode()
            request = urllib.request.Request(
                f"http://127.0.0.1:{self.ports['loki']}/loki/api/v1/push",
                data=json.dumps({"streams": [{"stream": {"service": "synthetic-dns-recovery"},
                    "values": [[str(time.time_ns()), "synthetic-dns-recovery"]]}]}).encode(),
                headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
            )
            deadline = time.monotonic() + 30
            code = None
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(request, timeout=5) as response:
                        code = response.status
                except urllib.error.HTTPError as error:
                    code = error.code
                    error.close()
                if code == 204:
                    break
                time.sleep(0.5)
            self.assertEqual(204, code)
        finally:
            subprocess.run(("docker", "rm", "-f", holder), capture_output=True, check=False)
            self._compose("exec", "-T", "ingest", "nginx", "-s", "reload")

    def test_logs_remain_separated_by_environment_after_storage_recreation(self) -> None:
        timestamp = str(time.time_ns())
        payload = {"streams": [
            {"stream": {"env": env, "service": "career-form-backend"},
             "values": [[timestamp, f"synthetic-{env}-{timestamp}"]]}
            for env in ("dev", "staging", "prod")
        ]}
        token = base64.b64encode(f"synthetic:{self.password}".encode()).decode()
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.ports['loki']}/loki/api/v1/push",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Basic {token}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                self.assertEqual(204, response.status)
        except urllib.error.HTTPError as error:
            body = error.read().decode()
            error.close()
            self.fail(f"Synthetic Loki push: {error.code} {body}")
        self._assert_logs(timestamp)

        recreated = self._compose("up", "-d", "--force-recreate", "loki")
        self.assertEqual(0, recreated.returncode, recreated.stderr)
        self._assert_logs(timestamp)

    def test_ingest_rejects_authenticated_but_disallowed_source(self) -> None:
        self.allowlist.write_text("deny all;\n", encoding="utf-8")
        try:
            reloaded = self._compose("restart", "ingest")
            self.assertEqual(0, reloaded.returncode, reloaded.stderr)
            token = base64.b64encode(f"synthetic:{self.password}".encode()).decode()
            request = urllib.request.Request(
                f"http://127.0.0.1:{self.ports['loki']}/loki/api/v1/push",
                data=json.dumps({"streams": [{"stream": {"service": "synthetic-readiness"},
                    "values": [[str(time.time_ns()), "synthetic-readiness"]]}]}).encode(),
                headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
            )
            deadline = time.monotonic() + 10
            code = None
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(request, timeout=5) as response:
                        code = response.status
                except urllib.error.HTTPError as error:
                    code = error.code
                    error.close()
                except urllib.error.URLError:
                    code = None
                if code == 403:
                    break
                time.sleep(0.2)
            self.assertEqual(403, code)
        finally:
            self.allowlist.write_text("allow all;\n", encoding="utf-8")
            restored = self._compose("restart", "ingest")
            self.assertEqual(0, restored.returncode, restored.stderr)
            deadline = time.monotonic() + 10
            restored_code = None
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(request, timeout=5) as response:
                        restored_code = response.status
                except urllib.error.HTTPError as error:
                    restored_code = error.code
                    error.close()
                except urllib.error.URLError:
                    restored_code = None
                if restored_code == 204:
                    break
                time.sleep(0.2)
            self.assertEqual(204, restored_code)

    def test_monitoring_host_metrics_reach_prometheus(self) -> None:
        query = urllib.parse.urlencode({"query": 'node_memory_MemTotal_bytes{job="host",instance="career-monitor"}'})
        deadline = time.monotonic() + 60
        result = []
        while time.monotonic() < deadline:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{self.prometheus_query_port}/api/v1/query?{query}", timeout=5,
            ) as response:
                result = json.load(response)["data"]["result"]
            if result:
                break
            time.sleep(0.5)
        self.assertEqual(1, len(result))
        self.assertGreater(float(result[0]["value"][1]), 0)
        self.assertNotIn("env", result[0]["metric"])

    def test_environment_alerts_are_provisioned_independently_of_dashboard_selection(self) -> None:
        rules = self._get("/api/v1/provisioning/alert-rules")
        for env in ("dev", "staging", "prod"):
            selected = [entry for entry in rules if entry["labels"].get("env") == env
                        and entry["labels"].get("service") == "career-form-backend"]
            self.assertEqual(7, len(selected))
            self.assertEqual({"backend-down", "data-gap", "http-5xx", "llm-timeout",
                              "api-slow", "openai-slow", "bounded-call-slow"},
                             {entry["labels"]["kind"] for entry in selected})
        disk = next(entry for entry in rules if entry["labels"].get("kind") == "disk-full"
                    and entry["labels"].get("instance") == "career-monitor")
        self.assertEqual("5m", disk["for"])
        self.assertEqual("career-monitor", disk["labels"]["instance"])

    def test_notification_policy_and_no_data_handling_match_operational_contract(self) -> None:
        policy = self._get("/api/v1/provisioning/policies")
        self.assertEqual("10m", policy["repeat_interval"])
        self.assertEqual("1m", policy["group_interval"])
        self.assertEqual("30s", policy["group_wait"])
        self.assertIn("env", policy["group_by"])
        rules = self._get("/api/v1/provisioning/alert-rules")
        for rule in rules:
            if rule["labels"].get("service") == "career-form-backend":
                self.assertEqual("OK", rule["noDataState"])
                self.assertEqual("Alerting", rule["execErrState"])
        contact = next(entry for entry in self._get("/api/v1/provisioning/contact-points")
                       if entry["uid"] == "career-discord")
        self.assertEqual("discord", contact["type"])
        self.assertFalse(contact["disableResolveMessage"])

    def test_alloy_discovers_three_synthetic_containers_and_forwards_logs_and_metrics(self) -> None:
        query = urllib.parse.urlencode({"query": 'synthetic_backend_ready{job="backend"}'})
        deadline = time.monotonic() + 90
        result = []
        while time.monotonic() < deadline:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{self.prometheus_query_port}/api/v1/query?{query}", timeout=5,
            ) as response:
                result = json.load(response)["data"]["result"]
            if len(result) == 3:
                break
            time.sleep(0.5)
        self.assertEqual({"dev", "staging", "prod"}, {entry["metric"]["env"] for entry in result})
        for env in ("dev", "staging", "prod"):
            query = urllib.parse.urlencode({
                "query": f'{{env="{env}",service="career-form-backend"}} |= "{self.agent_marker}-{env}"',
            })
            deadline = time.monotonic() + 60
            logs = []
            while time.monotonic() < deadline:
                logs = self._get("/api/datasources/proxy/uid/loki/loki/api/v1/query_range?" + query)["data"]["result"]
                if logs:
                    break
                time.sleep(0.5)
            self.assertTrue(logs, env)

    def test_discord_notifier_sends_each_environment_firing_and_recovery_to_mock_receiver(self) -> None:
        folder = self._request("/api/folders", "POST", {"uid": "synthetic-alerts", "title": "Synthetic alerts"})
        rules = []
        for env in ("dev", "staging", "prod"):
            rule = {
                "uid": f"synthetic-{env}", "title": f"synthetic-{env}", "folderUID": folder["uid"],
                "ruleGroup": "synthetic", "condition": "B", "for": "0s",
                "noDataState": "OK", "execErrState": "Alerting",
                "labels": {"env": env, "instance": "synthetic-host", "service": "synthetic"},
                "annotations": {"summary": f"synthetic {env} failure"},
                "data": [
                    {"refId": "A", "relativeTimeRange": {"from": 60, "to": 0}, "datasourceUid": "prometheus",
                     "model": {"refId": "A", "expr": "vector(1)", "instant": True, "range": False}},
                    {"refId": "B", "relativeTimeRange": {"from": 0, "to": 0}, "datasourceUid": "__expr__",
                     "model": {"refId": "B", "type": "math", "expression": "$A >= 1"}},
                ],
            }
            rules.append(self._request("/api/v1/provisioning/alert-rules", "POST", rule))
        self._request("/api/v1/provisioning/folder/synthetic-alerts/rule-groups/synthetic", "PUT", {"interval": 10})
        self._assert_notifications("firing")
        for rule in rules:
            first = rule["data"][0]
            recovered = {**rule, "data": [{**first, "model": {**first["model"], "expr": "vector(0)"}},
                                          rule["data"][1]]}
            self._request("/api/v1/provisioning/alert-rules/" + rule["uid"], "PUT", recovered)
        self._assert_notifications("resolved")

    def _assert_notifications(self, status: str) -> None:
        deadline = time.monotonic() + 120
        found = set()
        while time.monotonic() < deadline:
            for notification in tuple(self.notifications):
                body = json.dumps(notification).lower()
                if status in body:
                    found.update(env for env in ("dev", "staging", "prod") if f"synthetic-{env}" in body)
            if found == {"dev", "staging", "prod"}:
                break
            time.sleep(0.5)
        self.assertEqual({"dev", "staging", "prod"}, found, json.dumps(self.notifications))

    def test_replaced_backend_and_restarted_agent_resume_after_ingest_outage(self) -> None:
        recreated = self._compose("up", "-d", "--force-recreate", "synthetic-staging")
        self.assertEqual(0, recreated.returncode, recreated.stderr)
        restarted = self._compose("restart", "agent")
        self.assertEqual(0, restarted.returncode, restarted.stderr)
        marker = f"synthetic-after-redeploy-{time.time_ns()}"
        stopped = self._compose("stop", "ingest")
        self.assertEqual(0, stopped.returncode, stopped.stderr)
        try:
            generated = self._compose("exec", "-T", "synthetic-staging", "wget", "-q", "-O", "/dev/null",
                                      f"http://127.0.0.1:9091/actuator/prometheus?{marker}")
            self.assertEqual(0, generated.returncode, generated.stderr)
        finally:
            resumed = self._compose("start", "ingest")
            self.assertEqual(0, resumed.returncode, resumed.stderr)
        query = urllib.parse.urlencode({"query": f'{{env="staging"}} |= "{marker}"'})
        deadline = time.monotonic() + 90
        logs = []
        while time.monotonic() < deadline:
            logs = self._get("/api/datasources/proxy/uid/loki/loki/api/v1/query_range?" + query)["data"]["result"]
            if logs:
                break
            time.sleep(0.5)
        self.assertEqual({"staging"}, {entry["stream"]["env"] for entry in logs})

    def test_prometheus_and_grafana_data_survive_container_recreation(self) -> None:
        query = urllib.parse.urlencode({"query": 'synthetic_backend_ready{job="backend"}'})
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{self.prometheus_query_port}/api/v1/query?{query}", timeout=5,
            ) as response:
                result = json.load(response)["data"]["result"]
            if len(result) == 3:
                break
            time.sleep(0.5)
        self.assertEqual({"dev", "staging", "prod"}, {entry["metric"]["env"] for entry in result})
        saved = self._request("/api/dashboards/db", "POST", {
            "dashboard": {"uid": "synthetic-persistent", "title": "Synthetic persistent", "schemaVersion": 39},
        })
        before = saved["id"]
        before_time = time.time()
        recreated = self._compose("up", "-d", "--force-recreate", "prometheus", "grafana")
        self.assertEqual(0, recreated.returncode, recreated.stderr)
        deadline = time.monotonic() + 60
        dashboard = None
        while time.monotonic() < deadline:
            try:
                dashboard = self._get("/api/dashboards/uid/synthetic-persistent")["dashboard"]
                break
            except (OSError, ValueError):
                time.sleep(0.5)
        self.assertIsNotNone(dashboard)
        self.assertEqual(before, dashboard["id"])
        query = urllib.parse.urlencode({"query": 'synthetic_backend_ready{job="backend"}', "time": before_time})
        deadline = time.monotonic() + 60
        result = []
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{self.prometheus_query_port}/api/v1/query?{query}", timeout=5,
                ) as response:
                    result = json.load(response)["data"]["result"]
                if len(result) == 3:
                    break
            except (OSError, ValueError):
                pass
            time.sleep(0.5)
        self.assertEqual({"dev", "staging", "prod"}, {entry["metric"]["env"] for entry in result})

    def _assert_logs(self, timestamp: str) -> None:
        for env in ("dev", "staging", "prod"):
            with self.subTest(env=env):
                query = urllib.parse.urlencode({
                    "query": f'{{env="{env}",service="career-form-backend"}}',
                    "start": str(int(timestamp) - 60_000_000_000),
                    "end": str(time.time_ns()),
                })
                deadline = time.monotonic() + 60
                result = []
                while time.monotonic() < deadline:
                    try:
                        result = self._get(
                            "/api/datasources/proxy/uid/loki/loki/api/v1/query_range?" + query,
                        )["data"]["result"]
                        if any(f"synthetic-{env}-{timestamp}" in value[1]
                               for entry in result for value in entry["values"]):
                            break
                    except (OSError, ValueError):
                        pass
                    time.sleep(0.5)
                self.assertEqual({env}, {entry["stream"]["env"] for entry in result})
                self.assertTrue(any(f"synthetic-{env}-{timestamp}" in value[1]
                                    for entry in result for value in entry["values"]))



if __name__ == "__main__":
    unittest.main()
