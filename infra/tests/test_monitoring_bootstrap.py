import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "infra/scripts/bootstrap-monitoring-host.sh"


class MonitoringBootstrapTest(unittest.TestCase):
    def test_apply_without_confirmation_does_not_mutate_host(self) -> None:
        environment = {key: value for key, value in os.environ.items()
                       if key != "BOOTSTRAP_CONFIRM"}
        completed = subprocess.run(
            ("bash", str(SCRIPT), "--apply"),
            capture_output=True, text=True, env=environment, check=False,
        )

        self.assertEqual(2, completed.returncode, completed.stderr)
        self.assertIn("BOOTSTRAP_CONFIRM", completed.stderr)

    def test_missing_or_unknown_mode_fails_with_usage(self) -> None:
        for argument in ("", "--install"):
            with self.subTest(argument=argument):
                completed = subprocess.run(
                    ("bash", str(SCRIPT), argument),
                    capture_output=True, text=True, check=False,
                )
                self.assertEqual(2, completed.returncode)
                self.assertIn("--check | --apply", completed.stderr)

    def test_supported_ubuntu_arm64_hosts_pass_validation(self) -> None:
        for version, codename in (("24.04", "noble"), ("26.04", "resolute")):
            with self.subTest(version=version), tempfile.TemporaryDirectory() as directory:
                release = Path(directory) / "os-release"
                release.write_text(
                    f'ID=ubuntu\nVERSION_ID="{version}"\nVERSION_CODENAME={codename}\n',
                    encoding="utf-8",
                )
                completed = self._source(
                    'OS_RELEASE_FILE="$2"; '
                    'uname() { printf "%s\\n" aarch64; }; require_supported_host',
                    str(release),
                )
                self.assertEqual(0, completed.returncode, completed.stderr)

    def test_unsupported_os_or_architecture_fails_before_installation(self) -> None:
        for identifier, version, architecture in (
            ("debian", "13", "aarch64"),
            ("ubuntu", "25.10", "aarch64"),
            ("ubuntu", "26.04", "x86_64"),
        ):
            with self.subTest(os=identifier, version=version, arch=architecture):
                with tempfile.TemporaryDirectory() as directory:
                    release = Path(directory) / "os-release"
                    release.write_text(
                        f'ID={identifier}\nVERSION_ID="{version}"\n', encoding="utf-8",
                    )
                    completed = self._source(
                        'OS_RELEASE_FILE="$2"; '
                        'uname() { printf "%s\\n" "$3"; }; require_supported_host',
                        str(release), architecture,
                    )
                    self.assertEqual(1, completed.returncode)
                    self.assertIn("bootstrap error", completed.stderr)

    def test_missing_os_metadata_has_an_explicit_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            completed = self._source(
                'OS_RELEASE_FILE="$2/missing"; require_supported_host', directory,
            )
            self.assertEqual(1, completed.returncode)
            self.assertIn("metadata", completed.stderr)

    def test_directories_are_private_and_repeated_preparation_preserves_data(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            command = (
                'MONITORING_DATA_DIR="$2/data"; '
                'MONITORING_CONFIG_DIR="$2/config"; '
                'MONITORING_COMPOSE_DIR="$2/compose"; prepare_monitoring_directories'
            )
            first = self._source(command, directory)
            self.assertEqual(0, first.returncode, first.stderr)
            sentinel = root / "data" / "existing-data"
            sentinel.write_text("existing synthetic data", encoding="utf-8")
            second = self._source(command, directory)

            self.assertEqual(0, second.returncode, second.stderr)
            self.assertEqual("existing synthetic data", sentinel.read_text(encoding="utf-8"))
            for name, mode in (("data", 0o700), ("config", 0o700),
                               ("config/secrets", 0o700), ("compose", 0o755)):
                with self.subTest(path=name):
                    self.assertEqual(mode, stat.S_IMODE((root / name).stat().st_mode))

    def test_check_reports_missing_requirements_without_creating_directories(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            completed = self._source(
                'MONITORING_DATA_DIR="$2/data"; '
                'MONITORING_CONFIG_DIR="$2/config"; '
                'MONITORING_COMPOSE_DIR="$2/compose"; '
                'docker() { return 1; }; check_host',
                directory,
            )
            self.assertEqual(1, completed.returncode)
            self.assertIn("compose: missing", completed.stdout)
            self.assertIn("docker daemon: missing", completed.stdout)
            self.assertIn("monitoring data directory: missing", completed.stdout)
            self.assertEqual([], list(Path(directory).iterdir()))

    def test_repository_targets_resolute_arm64_with_matching_signing_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            completed = self._source(
                'DOCKER_KEYRING_DIR="$2/keyrings"; APT_SOURCES_DIR="$2/sources"; '
                'UBUNTU_CODENAME=resolute; '
                'dpkg() { test "$1" = --print-architecture; printf "%s\\n" arm64; }; '
                'curl() { test "$1" = -fsSL; '
                'test "$2" = https://download.docker.com/linux/ubuntu/gpg; '
                'test "$3" = -o; printf "%s\\n" synthetic-key > "$4"; }; '
                'install_docker_repository',
                directory,
            )
            self.assertEqual(0, completed.returncode, completed.stderr)
            root = Path(directory)
            source = (root / "sources/docker.sources").read_text(encoding="utf-8")
            actual = dict(line.split(": ", 1) for line in source.splitlines())
            self.assertEqual("resolute", actual["Suites"])
            self.assertEqual("arm64", actual["Architectures"])
            self.assertEqual("https://download.docker.com/linux/ubuntu", actual["URIs"])
            self.assertEqual(str(root / "keyrings/docker.asc"), actual["Signed-By"])
            self.assertEqual("synthetic-key\n", Path(actual["Signed-By"]).read_text())

    def test_conflicting_packages_fail_without_removing_them(self) -> None:
        completed = self._source(
            'dpkg-query() { if [[ "${@: -1}" == docker.io ]]; then '
            'printf "%s" installed; else return 1; fi; }; '
            'require_no_conflicting_packages',
        )
        self.assertEqual(1, completed.returncode)
        self.assertIn("docker.io", completed.stderr)

    def test_uninstalled_package_status_does_not_block_installation(self) -> None:
        completed = self._source(
            'dpkg-query() { printf "%s" config-files; }; '
            'require_no_conflicting_packages',
        )
        self.assertEqual(0, completed.returncode, completed.stderr)

    def _source(self, command: str, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ("bash", "-c", 'set -euo pipefail; source "$1"; ' + command,
             "monitoring-bootstrap-test", str(SCRIPT), *arguments),
            capture_output=True, text=True, check=False,
        )


if __name__ == "__main__":
    unittest.main()
