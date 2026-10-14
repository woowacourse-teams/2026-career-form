import json
import os
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENT = ROOT / "infra/monitoring/mongodb"


class MongoDBMonitoringAgentTest(unittest.TestCase):
    def test_compose_requires_host_mapping_and_keeps_alloy_private_with_file_secrets(self):
        environment = {**os.environ, "MONITORING_PRIVATE_IP": "127.0.0.1", "HOST_INSTANCE": "career-db",
                       "MONGODB_DEV_DATABASE": "synthetic_dev", "MONGODB_STAGING_DATABASE": "synthetic_staging",
                       "MONGODB_PROD_DATABASE": "synthetic_prod"}
        completed = subprocess.run(["docker", "compose", "-p", "cf207-agent-test", "-f", str(AGENT / "compose.yaml"),
                                    "config", "--format", "json"], env=environment, capture_output=True, text=True)
        self.assertEqual(0, completed.returncode, completed.stderr)
        config = json.loads(completed.stdout)
        service = config["services"]["alloy-db"]
        self.assertNotIn("ports", service)
        self.assertEqual("host", service["network_mode"])
        self.assertNotIn("MONGODB_URI", service["environment"])
        secret = next(mount for mount in service["volumes"] if mount["target"] == "/run/secrets/mongodb-uri")
        self.assertTrue(secret["read_only"])
        self.assertFalse(secret["bind"].get("create_host_path", False))

    def test_alloy_validates_with_protected_files_and_synthetic_database_names(self):
        import tempfile
        with tempfile.TemporaryDirectory(prefix="cf207-alloy-") as directory:
            root = Path(directory)
            (root / "mongodb-uri").write_text("mongodb://127.0.0.1:27017/?directConnection=true")
            (root / "ingest-password").write_text("synthetic-password")
            image = "grafana/alloy:v1.20.1@sha256:2aa2099af76c0098d4af7a4d6e48f86cb66dc1a000222ad927a1c67c6542d13f"
            command = ["docker", "run", "--rm", "-v", f"{AGENT}:/config:ro", "-v", f"{root}:/run/secrets:ro"]
            for key, value in {"MONITORING_PRIVATE_IP": "127.0.0.1", "HOST_INSTANCE": "career-db",
                               "MONGODB_DEV_DATABASE": "synthetic_dev", "MONGODB_STAGING_DATABASE": "synthetic_staging",
                               "MONGODB_PROD_DATABASE": "synthetic_prod"}.items():
                command.extend(["-e", f"{key}={value}"])
            command.extend([image, "validate", "/config/config.alloy"])
            completed = subprocess.run(command, capture_output=True, text=True, timeout=120)
            self.assertEqual(0, completed.returncode, completed.stderr)
