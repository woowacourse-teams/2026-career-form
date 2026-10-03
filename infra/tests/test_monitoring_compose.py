import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "infra/monitoring/compose.yaml"


class MonitoringComposeTest(unittest.TestCase):
    def test_only_ui_and_authenticated_private_ingest_are_published(self) -> None:
        config = self._render()
        services = config["services"]
        self.assertEqual("127.0.0.1", services["grafana"]["ports"][0]["host_ip"])
        self.assertEqual("3000", services["grafana"]["ports"][0]["published"])
        self.assertEqual({"80", "3100", "9090"},
                         {port["published"] for port in services["ingest"]["ports"]})
        ui = next(port for port in services["ingest"]["ports"] if port["target"] == 80)
        self.assertEqual("0.0.0.0", ui.get("host_ip", "0.0.0.0"))
        self.assertEqual({"10.0.0.72"},
                         {port["host_ip"] for port in services["ingest"]["ports"] if port["target"] != 80})
        for name in ("loki", "prometheus", "host-metrics"):
            self.assertFalse(services[name].get("ports"), name)

    def test_images_are_pinned_and_service_data_uses_fail_closed_bind_mounts(self) -> None:
        services = self._render()["services"]
        for service in services.values():
            self.assertRegex(service["image"], r"@sha256:[a-f0-9]{64}$")
            self.assertEqual("linux/arm64", service["platform"])
            self.assertEqual("unless-stopped", service["restart"])
            self.assertEqual("json-file", service["logging"]["driver"])
        for name, target in (("loki", "/loki"), ("prometheus", "/prometheus"),
                             ("grafana", "/var/lib/grafana"), ("host-metrics", "/var/lib/alloy")):
            volume = next(entry for entry in services[name]["volumes"] if entry["target"] == target)
            self.assertEqual(f"/srv/career-form-monitoring/{name}", volume["source"])
            self.assertEqual("bind", volume["type"])
            self.assertFalse(volume["bind"].get("create_host_path", False))

    def test_metrics_retention_and_receiver_are_enabled(self) -> None:
        command = self._render()["services"]["prometheus"]["command"]
        self.assertIn("--web.enable-remote-write-receiver", command)
        self.assertIn("--storage.tsdb.retention.time=14d", command)
        self.assertFalse(any("retention.size" in argument for argument in command))

    def test_ingest_mounts_source_ip_allowlist_read_only(self) -> None:
        ingest = self._render()["services"]["ingest"]
        allowlist = next(entry for entry in ingest["volumes"]
                         if entry["target"] == "/etc/nginx/ingest-allow.conf")
        self.assertTrue(allowlist["read_only"])

    def test_missing_private_ip_fails_before_containers_can_start(self) -> None:
        completed = self._config({"MONITORING_PRIVATE_IP": ""})
        self.assertNotEqual(0, completed.returncode)
        self.assertIn("MONITORING_PRIVATE_IP", completed.stderr)

    def test_grafana_password_is_read_from_a_file_not_a_literal(self) -> None:
        grafana = self._render()["services"]["grafana"]
        self.assertNotIn("GF_SECURITY_ADMIN_PASSWORD", grafana["environment"])
        self.assertEqual("/run/secrets/grafana-password",
                         grafana["environment"]["GF_SECURITY_ADMIN_PASSWORD__FILE"])
        self.assertEqual("false", grafana["environment"]["GF_AUTH_ANONYMOUS_ENABLED"])
        self.assertEqual("false", grafana["environment"]["GF_USERS_ALLOW_SIGN_UP"])

    def test_external_url_is_required_and_forwarded_to_grafana(self) -> None:
        missing = self._config({"MONITORING_PUBLIC_URL": ""})
        self.assertNotEqual(0, missing.returncode)
        self.assertIn("MONITORING_PUBLIC_URL", missing.stderr)
        configured = self._config({"MONITORING_PUBLIC_URL": "http://monitor.example.test/"})
        self.assertEqual(0, configured.returncode, configured.stderr)
        environment = json.loads(configured.stdout)["services"]["grafana"]["environment"]
        self.assertEqual("http://monitor.example.test/", environment["GF_SERVER_ROOT_URL"])

    def _render(self) -> dict:
        completed = self._config({})
        self.assertEqual(0, completed.returncode, completed.stderr)
        return json.loads(completed.stdout)

    def _config(self, overrides: dict) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            environment_file = Path(directory) / "grafana.env"
            environment_file.write_text("DISCORD_WEBHOOK_URL=https://synthetic.invalid/webhook\n")
            environment = {
                **os.environ,
                "MONITORING_PRIVATE_IP": "10.0.0.72",
                "MONITORING_PUBLIC_URL": "http://monitor.example.test/",
                "MONITORING_DATA_DIR": "/srv/career-form-monitoring",
                "MONITORING_SECRETS_DIR": directory,
                **overrides,
            }
            return subprocess.run(
                ("docker", "compose", "-p", "cf-131-config-test", "-f", str(COMPOSE),
                 "config", "--format", "json"),
                env=environment, capture_output=True, text=True, check=False,
            )


if __name__ == "__main__":
    unittest.main()
