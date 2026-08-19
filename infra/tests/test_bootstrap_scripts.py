import os
import stat
import subprocess
import tempfile
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
            "certbot",
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

    def test_app_state_directory_is_group_writable_for_runner(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "deploy-state"
            completed = subprocess.run(
                (
                    "/bin/bash",
                    "-c",
                    'source "$1"; DEPLOY_STATE_DIR="$2"; '
                    'DEPLOY_RUNNER_GROUP="$(id -gn)"; '
                    "prepare_deploy_state_directory",
                    "bootstrap-state-test",
                    str(APP_SCRIPT),
                    str(state),
                ),
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(0, completed.returncode, completed.stderr)
            state_stat = state.stat()
            self.assertEqual(0o770, stat.S_IMODE(state_stat.st_mode))
            self.assertEqual(os.getgid(), state_stat.st_gid)

    def test_cloudflared_repository_uses_the_downloaded_signing_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary_directory = root / "bin"
            binary_directory.mkdir()
            fake_curl = binary_directory / "curl"
            fake_curl.write_text(
                """#!/usr/bin/env bash
set -eu
output=''
while (( $# > 0 )); do
  if [[ "$1" == "-o" ]]; then
    output="$2"
    shift 2
  else
    shift
  fi
done
: > "$output"
""",
                encoding="utf-8",
            )
            fake_curl.chmod(0o755)
            environment = {
                **os.environ,
                "PATH": f"{binary_directory}:{os.environ['PATH']}",
            }
            completed = subprocess.run(
                (
                    "/bin/bash",
                    "-c",
                    'source "$1"; CLOUDFLARED_KEYRING_DIR="$2/keyrings"; '
                    'APT_SOURCES_DIR="$2/sources"; '
                    "install_cloudflared_repository",
                    "cloudflared-repository-test",
                    str(APP_SCRIPT),
                    str(root),
                ),
                cwd=ROOT,
                env=environment,
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(0, completed.returncode, completed.stderr)
            source = (root / "sources" / "cloudflared.list").read_text(
                encoding="utf-8"
            )
            self.assertIn(
                f"signed-by={root}/keyrings/cloudflare-main.gpg", source
            )

    def test_app_package_installation_includes_certbot_nginx_support(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary_directory = root / "bin"
            binary_directory.mkdir()
            apt_log = root / "apt.log"
            fake_apt_get = binary_directory / "apt-get"
            fake_apt_get.write_text(
                """#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$APT_LOG"
""",
                encoding="utf-8",
            )
            fake_apt_get.chmod(0o755)
            environment = {
                **os.environ,
                "APT_LOG": str(apt_log),
                "PATH": f"{binary_directory}:{os.environ['PATH']}",
            }
            completed = subprocess.run(
                (
                    "/bin/bash",
                    "-c",
                    'source "$1"; install_application_packages',
                    "app-package-test",
                    str(APP_SCRIPT),
                ),
                cwd=ROOT,
                env=environment,
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(0, completed.returncode, completed.stderr)
            invocation = apt_log.read_text(encoding="utf-8")
            self.assertIn("install --yes", invocation)
            self.assertIn("certbot", invocation.split())
            self.assertIn("python3-certbot-nginx", invocation.split())

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
