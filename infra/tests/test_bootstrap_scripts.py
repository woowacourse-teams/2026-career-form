import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
APP_SCRIPT = ROOT / "infra" / "scripts" / "bootstrap-app-host.sh"
MONGODB_SCRIPT = ROOT / "infra" / "scripts" / "bootstrap-mongodb-host.sh"


class BootstrapScriptContractTest(unittest.TestCase):
    def test_check_mode_reports_app_host_requirements_without_mutation(self) -> None:
        completed = self._run(APP_SCRIPT, "--check")
        output = (completed.stdout + completed.stderr).lower()

        self.assertIn(completed.returncode, (0, 1))
        for phrase in (
            "operating system",
            "architecture",
            "swap",
            "docker",
            "compose",
            "nginx",
            "cloudflared",
            "github actions runner",
        ):
            self.assertIn(phrase, output)

    def test_check_mode_reports_mongodb_host_requirements_without_mutation(self) -> None:
        completed = self._run(MONGODB_SCRIPT, "--check")
        output = (completed.stdout + completed.stderr).lower()

        self.assertIn(completed.returncode, (0, 1))
        for phrase in ("operating system", "architecture", "swap", "mongodb"):
            self.assertIn(phrase, output)

    def test_bootstrap_requires_explicit_mode_and_apply_confirmation(self) -> None:
        for script in (APP_SCRIPT, MONGODB_SCRIPT):
            with self.subTest(script=script.name, mode="missing"):
                completed = self._run(script)
                self.assertNotEqual(0, completed.returncode)
                self.assertIn("--check", completed.stderr)
                self.assertIn("--apply", completed.stderr)
            with self.subTest(script=script.name, mode="unconfirmed"):
                completed = self._run(script, "--apply")
                self.assertNotEqual(0, completed.returncode)
                self.assertIn("BOOTSTRAP_CONFIRM", completed.stderr)

    def test_bootstrap_interfaces_never_accept_secret_values(self) -> None:
        for script in (APP_SCRIPT, MONGODB_SCRIPT):
            content = script.read_text(encoding="utf-8")
            with self.subTest(script=script.name):
                self.assertNotIn("--token", content)
                self.assertNotIn("RUNNER_TOKEN", content)
                self.assertNotIn("MONGODB_PASSWORD", content)
                self.assertIn("set -euo pipefail", content)

    def test_setup_document_lists_required_github_configuration_names(self) -> None:
        setup = (ROOT / "docs" / "operations" / "cicd-setup.md").read_text(
            encoding="utf-8"
        )

        for name in (
            "DOCKERHUB_USERNAME",
            "DOCKERHUB_TOKEN",
            "DOCKERHUB_IMAGE",
            "BACKEND_PORT",
            "SPRING_MONGODB_URI",
        ):
            self.assertIn(name, setup)
        self.assertIn("development", setup)
        self.assertIn("staging", setup)
        self.assertIn("production", setup)
        self.assertIn("registration token", setup)
        self.assertIn("저장하지", setup)

    def _run(self, script: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ("/bin/bash", str(script), *arguments),
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
