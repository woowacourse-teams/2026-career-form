import os
import grp
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "infra" / "scripts" / "deploy.sh"
NEW_IMAGE = "registry.example/career-form@sha256:" + ("a" * 64)
OLD_IMAGE = "registry.example/career-form@sha256:" + ("b" * 64)
STALE_IMAGE = "registry.example/career-form@sha256:" + ("c" * 64)
SHARED_HOST_IMAGE = "registry.example/career-form@sha256:" + ("d" * 64)
OTHER_IMAGE = "registry.example/another-service@sha256:" + ("e" * 64)


class DeployScriptTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.temp = Path(self.temporary_directory.name)
        self.bin = self.temp / "bin"
        self.bin.mkdir()
        self.docker_log = self.temp / "docker.log"
        self.curl_log = self.temp / "curl.log"
        self.curl_count = self.temp / "curl.count"
        self.state = self.temp / "state"
        self._write_executable(
            "docker",
            """#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "${1:-} ${2:-}" == "image ls" ]]; then
  printf '%s\n' "${FAKE_IMAGE_LIST:-}"
fi
if [[ -n "${FAKE_DOCKER_FAIL_PATTERN:-}" && "$*" == *"$FAKE_DOCKER_FAIL_PATTERN"* ]]; then
  exit 1
fi
""",
        )
        self._write_executable(
            "curl",
            """#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$FAKE_CURL_LOG"
count=0
if [[ -f "$FAKE_CURL_COUNT" ]]; then
  count="$(cat "$FAKE_CURL_COUNT")"
fi
count=$((count + 1))
printf '%s' "$count" > "$FAKE_CURL_COUNT"
if (( count <= ${FAKE_CURL_FAILURES:-0} )); then
  exit 22
fi
printf '{"status":"UP"}'
""",
        )
        self._write_executable("sleep", "#!/usr/bin/env bash\nexit 0\n")

    def test_rejects_invalid_digest_before_docker_is_called(self) -> None:
        completed = self._run(BACKEND_IMAGE="registry.example/career-form:latest")

        self.assertNotEqual(0, completed.returncode)
        self.assertIn("digest", completed.stderr)
        self.assertFalse(self.docker_log.exists())

    def test_rejects_environment_profile_mismatch(self) -> None:
        completed = self._run(SPRING_PROFILES_ACTIVE="prod")

        self.assertNotEqual(0, completed.returncode)
        self.assertIn("profile", completed.stderr)
        self.assertFalse(self.docker_log.exists())

    def test_successful_deploy_records_digest_without_leaking_secret(self) -> None:
        completed = self._run()

        self.assertEqual(0, completed.returncode, completed.stderr)
        log = self.docker_log.read_text(encoding="utf-8")
        self.assertIn(f"pull {NEW_IMAGE}", log)
        self.assertIn("config --quiet", log)
        self.assertIn("up --detach --no-build backend", log)
        self.assertEqual(
            NEW_IMAGE,
            (self.state / "staging" / "current-digest").read_text(
                encoding="utf-8"
            ).strip(),
        )
        self.assertNotIn("redacted-password", completed.stdout + completed.stderr)
        self.assertEqual(
            0o770,
            stat.S_IMODE((self.state / "staging").stat().st_mode),
        )
        self.assertEqual(
            0o660,
            stat.S_IMODE(
                (self.state / "staging" / "current-digest").stat().st_mode
            ),
        )

    def test_readiness_requests_have_bounded_connect_and_total_time(self) -> None:
        completed = self._run()

        self.assertEqual(0, completed.returncode, completed.stderr)
        invocation = self.curl_log.read_text(encoding="utf-8")
        self.assertIn("--connect-timeout", invocation)
        self.assertIn("--max-time", invocation)

    def test_readiness_failure_rolls_back_and_preserves_original_failure(self) -> None:
        environment_state = self.state / "production"
        environment_state.mkdir(parents=True)
        (environment_state / "current-digest").write_text(
            OLD_IMAGE + "\n", encoding="utf-8"
        )

        completed = self._run(
            DEPLOY_ENVIRONMENT="production",
            SPRING_PROFILES_ACTIVE="prod",
            FAKE_CURL_FAILURES="2",
            READINESS_ATTEMPTS="2",
        )

        self.assertNotEqual(0, completed.returncode)
        log = self.docker_log.read_text(encoding="utf-8")
        self.assertIn(f"pull {NEW_IMAGE}", log)
        self.assertIn(f"pull {OLD_IMAGE}", log)
        self.assertGreaterEqual(log.count("up --detach --no-build backend"), 2)
        self.assertIn("rollback succeeded", completed.stderr)
        self.assertEqual(
            OLD_IMAGE,
            (environment_state / "current-digest").read_text(
                encoding="utf-8"
            ).strip(),
        )

    def test_readiness_failure_without_previous_digest_reports_no_rollback(self) -> None:
        completed = self._run(
            FAKE_CURL_FAILURES="2",
            READINESS_ATTEMPTS="2",
        )

        self.assertNotEqual(0, completed.returncode)
        self.assertIn("no previous digest", completed.stderr)

    def test_initial_failure_removes_container_and_unreferenced_images(self) -> None:
        completed = self._run(
            FAKE_CURL_FAILURES="1",
            READINESS_ATTEMPTS="1",
            FAKE_IMAGE_LIST="\n".join((NEW_IMAGE, STALE_IMAGE)),
        )

        self.assertNotEqual(0, completed.returncode)
        log = self.docker_log.read_text(encoding="utf-8")
        self.assertIn("rm --stop --force backend", log)
        self.assertIn(f"image rm {NEW_IMAGE}", log)
        self.assertIn(f"image rm {STALE_IMAGE}", log)

    def test_rollback_failure_requires_manual_recovery(self) -> None:
        environment_state = self.state / "production"
        environment_state.mkdir(parents=True)
        (environment_state / "current-digest").write_text(
            OLD_IMAGE + "\n", encoding="utf-8"
        )

        completed = self._run(
            DEPLOY_ENVIRONMENT="production",
            SPRING_PROFILES_ACTIVE="prod",
            FAKE_CURL_FAILURES="1",
            READINESS_ATTEMPTS="1",
            FAKE_DOCKER_FAIL_PATTERN=OLD_IMAGE,
        )

        self.assertNotEqual(0, completed.returncode)
        self.assertIn("rollback failed", completed.stderr)
        self.assertIn("manual recovery", completed.stderr)

    def test_successful_rollback_removes_failed_and_stale_images(self) -> None:
        environment_state = self.state / "production"
        environment_state.mkdir(parents=True)
        (environment_state / "current-digest").write_text(
            OLD_IMAGE + "\n", encoding="utf-8"
        )

        completed = self._run(
            DEPLOY_ENVIRONMENT="production",
            SPRING_PROFILES_ACTIVE="prod",
            FAKE_CURL_FAILURES="1",
            READINESS_ATTEMPTS="1",
            FAKE_IMAGE_LIST="\n".join((NEW_IMAGE, OLD_IMAGE, STALE_IMAGE)),
        )

        self.assertNotEqual(0, completed.returncode)
        log = self.docker_log.read_text(encoding="utf-8")
        self.assertIn("rollback succeeded", completed.stderr)
        self.assertIn(f"image rm {NEW_IMAGE}", log)
        self.assertIn(f"image rm {STALE_IMAGE}", log)
        self.assertNotIn(f"image rm {OLD_IMAGE}", log)

    def test_cleanup_removes_only_stale_digests_from_same_repository(self) -> None:
        environment_state = self.state / "staging"
        environment_state.mkdir(parents=True)
        (environment_state / "current-digest").write_text(
            OLD_IMAGE + "\n", encoding="utf-8"
        )

        completed = self._run(
            FAKE_IMAGE_LIST="\n".join(
                (NEW_IMAGE, OLD_IMAGE, STALE_IMAGE, OTHER_IMAGE)
            )
        )

        self.assertEqual(0, completed.returncode, completed.stderr)
        log = self.docker_log.read_text(encoding="utf-8")
        self.assertIn(f"image rm {STALE_IMAGE}", log)
        self.assertNotIn(f"image rm {NEW_IMAGE}", log)
        self.assertNotIn(f"image rm {OLD_IMAGE}", log)
        self.assertNotIn(f"image rm {OTHER_IMAGE}", log)
        self.assertEqual(
            OLD_IMAGE,
            (environment_state / "previous-digest").read_text(
                encoding="utf-8"
            ).strip(),
        )

    def test_cleanup_preserves_digests_used_by_another_environment_on_host(self) -> None:
        development_state = self.state / "development"
        development_state.mkdir(parents=True)
        (development_state / "current-digest").write_text(
            SHARED_HOST_IMAGE + "\n", encoding="utf-8"
        )

        completed = self._run(
            FAKE_IMAGE_LIST="\n".join(
                (NEW_IMAGE, SHARED_HOST_IMAGE, STALE_IMAGE)
            )
        )

        self.assertEqual(0, completed.returncode, completed.stderr)
        log = self.docker_log.read_text(encoding="utf-8")
        self.assertNotIn(f"image rm {SHARED_HOST_IMAGE}", log)
        self.assertIn(f"image rm {STALE_IMAGE}", log)

    def _run(self, **overrides: str) -> subprocess.CompletedProcess[str]:
        environment = {
            **os.environ,
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "DEPLOY_ENVIRONMENT": "staging",
            "BACKEND_IMAGE": NEW_IMAGE,
            "BACKEND_PORT": "18081",
            "SPRING_PROFILES_ACTIVE": "staging",
            "SPRING_MONGODB_URI": "mongodb://user:redacted-password@db.invalid/app",
            "DEPLOY_STATE_DIR": str(self.state),
            "READINESS_ATTEMPTS": "1",
            "READINESS_INTERVAL_SECONDS": "0",
            "DEPLOY_RUNNER_GROUP": grp.getgrgid(os.getgid()).gr_name,
            "FAKE_DOCKER_LOG": str(self.docker_log),
            "FAKE_CURL_COUNT": str(self.curl_count),
            "FAKE_CURL_LOG": str(self.curl_log),
            "FAKE_CURL_FAILURES": "0",
        }
        environment.update(overrides)
        return subprocess.run(
            ("/bin/bash", str(SCRIPT)),
            cwd=ROOT,
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )

    def _write_executable(self, name: str, content: str) -> None:
        path = self.bin / name
        path.write_text(content, encoding="utf-8")
        path.chmod(0o755)


if __name__ == "__main__":
    unittest.main()
