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
            "OPENAI_API_KEY": "synthetic-openai-key",
        }
        environment.pop("CAREER_FORM_LLM_ENABLED", None)

        completed = subprocess.run(
            (
                "docker",
                "compose",
                "--env-file",
                "/dev/null",
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
            "false", backend["environment"]["CAREER_FORM_LLM_ENABLED"]
        )
        self.assertEqual(
            "synthetic-openai-key", backend["environment"]["OPENAI_API_KEY"]
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
        self.assertEqual("staging", backend.get("labels", {}).get("career-form.env"))
        self.assertEqual("career-form-backend", backend.get("labels", {}).get("career-form.service"))
        self.assertEqual("true", backend.get("labels", {}).get("career-form.monitoring"))
        self.assertIn("9091", backend["expose"])
        self.assertFalse(any(port["target"] == 9091 for port in backend["ports"]))

    def test_deploy_overlay_uses_injected_llm_enabled_with_empty_default(self) -> None:
        for value, expected in (("", "false"), ("true", "true"), ("false", "false")):
            with self.subTest(value=value):
                environment = {
                    **os.environ,
                    "BACKEND_IMAGE": f"registry.example/career-form@{DIGEST}",
                    "BACKEND_PORT": "18081",
                    "SPRING_PROFILES_ACTIVE": "staging",
                    "SPRING_MONGODB_URI": "mongodb://redacted.invalid/career-form",
                    "OPENAI_API_KEY": "synthetic-openai-key",
                    "CAREER_FORM_LLM_ENABLED": value,
                }

                completed = subprocess.run(
                    (
                        "docker",
                        "compose",
                        "--env-file",
                        "/dev/null",
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
                backend = json.loads(completed.stdout)["services"]["backend"]
                self.assertEqual(
                    expected, backend["environment"]["CAREER_FORM_LLM_ENABLED"]
                )

    def test_runtime_image_contains_healthcheck_client(self) -> None:
        dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")
        runtime = dockerfile.split(" AS runtime", maxsplit=1)[1]

        self.assertIn("curl", runtime)
        self.assertIn("--no-install-recommends", runtime)
        self.assertIn("rm -rf /var/lib/apt/lists/*", runtime)


if __name__ == "__main__":
    unittest.main()
