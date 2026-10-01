import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
LOCAL_SCRIPT = REPOSITORY_ROOT / "scripts" / "local.py"


class LocalScriptTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)

        self.project = (Path(self.temporary_directory.name) / "career-form").resolve()
        (self.project / "scripts").mkdir(parents=True)
        (self.project / "compose.yaml").write_text("services: {}\n", encoding="utf-8")
        (self.project / "compose.local.yaml").write_text(
            "services: {}\n",
            encoding="utf-8",
        )

        self.docker_log = self.project / "docker-calls.jsonl"
        self.gradle_log = self.project / "gradle-calls.jsonl"
        self.event_log = self.project / "events.jsonl"
        self.fake_bin = self.project / "fake-bin"
        self.fake_bin.mkdir()
        self.environment = os.environ.copy()
        self.environment["FAKE_DOCKER_LOG"] = str(self.docker_log)
        self.environment["FAKE_GRADLE_LOG"] = str(self.gradle_log)
        self.environment["FAKE_EVENT_LOG"] = str(self.event_log)
        self.environment["PATH"] = os.pathsep.join(
            (str(self.fake_bin), self.environment.get("PATH", ""))
        )
        self._create_fake_docker()
        self._create_fake_gradle_wrapper()

    def test_missing_env_file_stops_before_docker(self) -> None:
        result = self._run_local("up", create_env_file=False)

        self.assertEqual(2, result.returncode)
        self.assertIn(".env.local", result.stderr)
        self.assertFalse(self.docker_log.exists())

    def test_default_and_explicit_up_validate_then_start_stack(self) -> None:
        for arguments in ((), ("up",)):
            with self.subTest(arguments=arguments):
                self._reset_docker_log()
                self.gradle_log.unlink(missing_ok=True)
                self.event_log.unlink(missing_ok=True)

                result = self._run_local(*arguments)

                self.assertEqual(0, result.returncode, result.stderr)
                self.assertEqual([["bootJar"]], self._gradle_calls())
                self.assertEqual(["docker-config", "gradle", "docker-up"], self._events())
                self.assertEqual(
                    [
                        [*self._compose_prefix(), "config", "--quiet"],
                        [
                            *self._compose_prefix(),
                            "up",
                            "--build",
                            "--detach",
                            "--wait",
                        ],
                    ],
                    self._docker_calls(),
                )

    def test_config_failure_stops_before_up(self) -> None:
        self.environment["FAKE_DOCKER_CONFIG_EXIT"] = "23"

        result = self._run_local("up")

        self.assertEqual(23, result.returncode)
        self.assertEqual(
            [[*self._compose_prefix(), "config", "--quiet"]],
            self._docker_calls(),
        )
        self.assertFalse(self.gradle_log.exists())

    def test_gradle_failure_stops_before_docker_up(self) -> None:
        self.environment["FAKE_GRADLE_EXIT"] = "24"

        result = self._run_local("up")

        self.assertEqual(24, result.returncode)
        self.assertIn("JDK", result.stderr)
        self.assertEqual([["bootJar"]], self._gradle_calls())
        self.assertEqual(
            [[*self._compose_prefix(), "config", "--quiet"]],
            self._docker_calls(),
        )

    def test_missing_gradle_wrapper_reports_clear_failure(self) -> None:
        self._gradle_wrapper().unlink()

        result = self._run_local("up")

        self.assertEqual(127, result.returncode)
        self.assertIn("Gradle wrapper", result.stderr)
        self.assertEqual(
            [[*self._compose_prefix(), "config", "--quiet"]],
            self._docker_calls(),
        )

    def test_management_actions_use_expected_compose_commands(self) -> None:
        expectations = {
            "down": ["down"],
            "logs": ["logs", "--follow", "--tail", "200", "backend", "mongodb"],
            "status": ["ps"],
        }

        for action, expected_arguments in expectations.items():
            with self.subTest(action=action):
                self._reset_docker_log()

                result = self._run_local(action)

                self.assertEqual(0, result.returncode, result.stderr)
                self.assertEqual(
                    [[*self._compose_prefix(), *expected_arguments]],
                    self._docker_calls(),
                )
                self.assertFalse(self.gradle_log.exists())

    def test_missing_docker_cli_reports_clear_failure(self) -> None:
        self.environment["PATH"] = str(self.project / "empty-bin")

        result = self._run_local("status")

        self.assertEqual(127, result.returncode)
        self.assertIn("Docker CLI", result.stderr)

    def _run_local(
        self,
        *arguments: str,
        create_env_file: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        self.assertTrue(LOCAL_SCRIPT.is_file(), f"missing production script: {LOCAL_SCRIPT}")
        shutil.copy2(LOCAL_SCRIPT, self.project / "scripts" / "local.py")
        if create_env_file:
            (self.project / ".env.local").touch()

        return subprocess.run(
            [sys.executable, str(self.project / "scripts" / "local.py"), *arguments],
            cwd=Path(self.temporary_directory.name),
            env=self.environment,
            check=False,
            capture_output=True,
            text=True,
        )

    def _compose_prefix(self) -> list[str]:
        return [
            "compose",
            "--env-file",
            str(self.project / ".env.local"),
            "--project-directory",
            str(self.project),
            "-f",
            str(self.project / "compose.yaml"),
            "-f",
            str(self.project / "compose.local.yaml"),
        ]

    def _create_fake_docker(self) -> None:
        implementation = self.fake_bin / "fake_docker.py"
        implementation.write_text(
            textwrap.dedent(
                """
                import json
                import os
                import sys
                from pathlib import Path

                log = Path(os.environ["FAKE_DOCKER_LOG"])
                with log.open("a", encoding="utf-8") as output:
                    output.write(json.dumps(sys.argv[1:]) + "\\n")

                event_log = Path(os.environ["FAKE_EVENT_LOG"])
                if "config" in sys.argv[1:]:
                    event = "docker-config"
                elif "up" in sys.argv[1:]:
                    event = "docker-up"
                else:
                    event = "docker-management"
                with event_log.open("a", encoding="utf-8") as output:
                    output.write(json.dumps(event) + "\\n")

                if event == "docker-up":
                    artifact = Path.cwd() / "backend" / "build" / "libs" / "fresh.jar"
                    if not artifact.is_file():
                        print("fresh backend artifact is missing", file=sys.stderr)
                        raise SystemExit(98)

                if "config" in sys.argv[1:]:
                    raise SystemExit(int(os.environ.get("FAKE_DOCKER_CONFIG_EXIT", "0")))
                raise SystemExit(int(os.environ.get("FAKE_DOCKER_EXIT", "0")))
                """
            ).lstrip(),
            encoding="utf-8",
        )

        if os.name == "nt":
            (self.fake_bin / "docker.cmd").write_text(
                f'@"{sys.executable}" "{implementation}" %*\r\n',
                encoding="utf-8",
            )
            return

        docker = self.fake_bin / "docker"
        docker.write_text(
            f"#!{sys.executable}\n"
            f"exec(compile(open({str(implementation)!r}, encoding='utf-8').read(), "
            f"{str(implementation)!r}, 'exec'))\n",
            encoding="utf-8",
        )
        docker.chmod(docker.stat().st_mode | stat.S_IEXEC)

    def _create_fake_gradle_wrapper(self) -> None:
        backend = self.project / "backend"
        backend.mkdir()
        implementation = backend / "fake_gradle.py"
        implementation.write_text(
            textwrap.dedent(
                """
                import json
                import os
                import sys
                from pathlib import Path

                log = Path(os.environ["FAKE_GRADLE_LOG"])
                with log.open("a", encoding="utf-8") as output:
                    output.write(json.dumps(sys.argv[1:]) + "\\n")
                with Path(os.environ["FAKE_EVENT_LOG"]).open("a", encoding="utf-8") as output:
                    output.write(json.dumps("gradle") + "\\n")

                exit_code = int(os.environ.get("FAKE_GRADLE_EXIT", "0"))
                if exit_code:
                    print("fake Gradle build failed", file=sys.stderr)
                    raise SystemExit(exit_code)

                artifact = Path.cwd() / "build" / "libs" / "fresh.jar"
                artifact.parent.mkdir(parents=True, exist_ok=True)
                artifact.write_text("fresh", encoding="utf-8")
                """
            ).lstrip(),
            encoding="utf-8",
        )

        if os.name == "nt":
            (backend / "gradlew.bat").write_text(
                f'@"{sys.executable}" "{implementation}" %*\r\n',
                encoding="utf-8",
            )
            return

        wrapper = backend / "gradlew"
        wrapper.write_text(
            f"#!{sys.executable}\n"
            f"exec(compile(open({str(implementation)!r}, encoding='utf-8').read(), "
            f"{str(implementation)!r}, 'exec'))\n",
            encoding="utf-8",
        )
        wrapper.chmod(wrapper.stat().st_mode | stat.S_IEXEC)

    def _gradle_wrapper(self) -> Path:
        return self.project / "backend" / ("gradlew.bat" if os.name == "nt" else "gradlew")

    def _docker_calls(self) -> list[list[str]]:
        return [
            json.loads(line)
            for line in self.docker_log.read_text(encoding="utf-8").splitlines()
        ]

    def _gradle_calls(self) -> list[list[str]]:
        return [
            json.loads(line)
            for line in self.gradle_log.read_text(encoding="utf-8").splitlines()
        ]

    def _events(self) -> list[str]:
        return [
            json.loads(line)
            for line in self.event_log.read_text(encoding="utf-8").splitlines()
        ]

    def _reset_docker_log(self) -> None:
        self.docker_log.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
