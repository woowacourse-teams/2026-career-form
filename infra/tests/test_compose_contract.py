import json
import os
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEPLOY_COMPOSE = ROOT / "infra" / "compose.deploy.yaml"
DIGEST = "sha256:" + ("a" * 64)


class DeployComposeContractTest(unittest.TestCase):
    def test_deploy_overlay_renders_digest_pinned_runtime_contract(self) -> None:
        environment = {
            **os.environ,
            "BACKEND_IMAGE": f"registry.example/career-form@{DIGEST}",
            "BACKEND_PORT": "18081",
            "SPRING_PROFILES_ACTIVE": "staging",
            "SPRING_MONGODB_URI": "mongodb://redacted.invalid/career-form",
        }

        completed = subprocess.run(
            (
                "docker",
                "compose",
                "--project-directory",
                str(ROOT),
                "-f",
                str(ROOT / "compose.yaml"),
                "-f",
                str(DEPLOY_COMPOSE),
                "config",
                "--format",
                "json",
            ),
            cwd=ROOT,
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(0, completed.returncode, completed.stderr)
        config = json.loads(completed.stdout)
        backend = config["services"]["backend"]

        self.assertEqual(
            f"registry.example/career-form@{DIGEST}", backend["image"]
        )
        self.assertNotIn("build", backend)
        self.assertEqual("staging", backend["environment"]["SPRING_PROFILES_ACTIVE"])
        self.assertEqual(
            "mongodb://redacted.invalid/career-form",
            backend["environment"]["SPRING_MONGODB_URI"],
        )
        self.assertEqual(
            {
                "mode": "ingress",
                "host_ip": "127.0.0.1",
                "target": 8080,
                "published": "18081",
                "protocol": "tcp",
            },
            backend["ports"][0],
        )
        self.assertEqual("json-file", backend["logging"]["driver"])
        self.assertEqual("10m", backend["logging"]["options"]["max-size"])
        self.assertEqual("3", backend["logging"]["options"]["max-file"])

    def test_runtime_image_contains_healthcheck_client(self) -> None:
        dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")
        runtime = dockerfile.split(" AS runtime", maxsplit=1)[1]

        self.assertIn("curl", runtime)
        self.assertIn("--no-install-recommends", runtime)
        self.assertIn("rm -rf /var/lib/apt/lists/*", runtime)


if __name__ == "__main__":
    unittest.main()
