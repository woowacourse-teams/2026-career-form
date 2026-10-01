import json
import os
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENT = ROOT / "infra/monitoring/alloy/compose.yaml"


class MonitoringAgentTest(unittest.TestCase):
    def test_agent_uses_host_network_without_exposing_management_ui(self) -> None:
        completed = subprocess.run(
            ("docker", "compose", "-p", "cf-131-agent-config", "-f", str(AGENT),
             "config", "--format", "json"),
            env={**os.environ, "HOST_INSTANCE": "career-dev-staging",
                 "MONITORING_PRIVATE_IP": "10.0.0.72"},
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(0, completed.returncode, completed.stderr)
        alloy = json.loads(completed.stdout)["services"]["alloy"]
        self.assertEqual("host", alloy["network_mode"])
        self.assertFalse(alloy.get("ports"))
        self.assertIn("--server.http.listen-addr=127.0.0.1:12345", alloy["command"])
        self.assertEqual("career-dev-staging", alloy["environment"]["HOST_INSTANCE"])
        self.assertNotIn("INGEST_PASSWORD", alloy["environment"])
        password = next(entry for entry in alloy["volumes"] if entry["target"] == "/run/secrets/ingest-password")
        self.assertTrue(password["read_only"])
        self.assertFalse(password["bind"].get("create_host_path", False))


if __name__ == "__main__":
    unittest.main()
