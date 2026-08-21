import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MONGODB_COMPOSE = ROOT / "infra" / "mongodb" / "compose.yaml"
MONGODB_RUNNER = ROOT / "infra" / "scripts" / "mongodb-compose.sh"


class MongoDbComposeContractTest(unittest.TestCase):
    def test_renders_private_authenticated_persistent_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / "mongodb.env"
            env_file.write_text(
                "MONGO_INITDB_ROOT_USERNAME=redacted-admin\n"
                "MONGO_INITDB_ROOT_PASSWORD=redacted-password\n",
                encoding="utf-8",
            )
            environment = {
                **os.environ,
                "MONGODB_BIND_IP": "10.0.100.237",
                "MONGODB_CONFIG_DIR": str(root),
                "MONGODB_DATA_DIR": str(root / "data"),
                "MONGODB_ENV_FILE": str(env_file),
            }

            completed = self._render(environment)

            self.assertEqual(0, completed.returncode, completed.stderr)
            config = json.loads(completed.stdout)
            mongodb = config["services"]["mongodb"]
            self.assertEqual(
                "mongo:8.0.26-noble@"
                "sha256:b49841837cd7688885d7479d14a71733bacae4c99faaae615622384eaee045a0",
                mongodb["image"],
            )
            self.assertEqual("unless-stopped", mongodb["restart"])
            self.assertEqual(
                {
                    "mode": "ingress",
                    "host_ip": "10.0.100.237",
                    "target": 27017,
                    "published": "27017",
                    "protocol": "tcp",
                },
                mongodb["ports"][0],
            )
            volume = mongodb["volumes"][0]
            self.assertEqual("bind", volume["type"])
            self.assertEqual(str(root / "data"), volume["source"])
            self.assertEqual("/data/db", volume["target"])
            self.assertEqual(
                "redacted-admin",
                mongodb["environment"]["MONGO_INITDB_ROOT_USERNAME"],
            )
            self.assertIn("healthcheck", mongodb)

    def test_requires_explicit_private_bind_address(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / "mongodb.env"
            env_file.write_text(
                "MONGO_INITDB_ROOT_USERNAME=redacted-admin\n"
                "MONGO_INITDB_ROOT_PASSWORD=redacted-password\n",
                encoding="utf-8",
            )
            environment = {
                **os.environ,
                "MONGODB_CONFIG_DIR": str(root),
                "MONGODB_DATA_DIR": str(root / "data"),
                "MONGODB_ENV_FILE": str(env_file),
            }
            environment.pop("MONGODB_BIND_IP", None)

            completed = self._render(environment)

            self.assertNotEqual(0, completed.returncode)
            self.assertIn("MONGODB_BIND_IP", completed.stderr)

    def _render(self, environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            (
                "docker",
                "compose",
                "--project-name",
                "career-form-mongodb-test",
                "-f",
                str(MONGODB_COMPOSE),
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

    def test_runner_rejects_non_private_bind_address_before_docker(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / "mongodb.env"
            env_file.write_text(
                "MONGO_INITDB_ROOT_USERNAME=redacted-admin\n"
                "MONGO_INITDB_ROOT_PASSWORD=redacted-password\n",
                encoding="utf-8",
            )
            env_file.chmod(0o600)
            environment = {
                **os.environ,
                "MONGODB_BIND_IP": "0.0.0.0",
                "MONGODB_COMPOSE_FILE": str(MONGODB_COMPOSE),
                "MONGODB_ENV_FILE": str(env_file),
            }

            completed = subprocess.run(
                ("/bin/bash", str(MONGODB_RUNNER), "--check"),
                cwd=ROOT,
                env=environment,
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertNotEqual(0, completed.returncode)
            self.assertIn("private IPv4", completed.stderr)

    def test_runner_checks_compose_without_printing_secret_values(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary_directory = root / "bin"
            binary_directory.mkdir()
            docker_log = root / "docker.log"
            fake_docker = binary_directory / "docker"
            fake_docker.write_text(
                """#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$DOCKER_LOG"
""",
                encoding="utf-8",
            )
            fake_docker.chmod(0o755)
            env_file = root / "mongodb.env"
            env_file.write_text(
                "MONGO_INITDB_ROOT_USERNAME=redacted-admin\n"
                "MONGO_INITDB_ROOT_PASSWORD=secret-that-must-not-print\n",
                encoding="utf-8",
            )
            env_file.chmod(0o600)
            environment = {
                **os.environ,
                "DOCKER_LOG": str(docker_log),
                "MONGODB_BIND_IP": "10.0.100.237",
                "MONGODB_COMPOSE_FILE": str(MONGODB_COMPOSE),
                "MONGODB_ENV_FILE": str(env_file),
                "PATH": f"{binary_directory}:{os.environ['PATH']}",
            }

            completed = subprocess.run(
                ("/bin/bash", str(MONGODB_RUNNER), "--check"),
                cwd=ROOT,
                env=environment,
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(0, completed.returncode, completed.stderr)
            self.assertIn("config --quiet", docker_log.read_text(encoding="utf-8"))
            self.assertNotIn(
                "secret-that-must-not-print",
                completed.stdout + completed.stderr,
            )

    def test_runner_maps_lifecycle_modes_to_reviewed_compose_commands(self) -> None:
        cases = {
            "--pull": ("config --quiet", "pull"),
            "--up": ("config --quiet", "up --detach --wait"),
            "--status": ("ps",),
            "--shell": (
                "exec mongodb mongosh --host 127.0.0.1 "
                "--authenticationDatabase admin --username career_form_admin "
                "--password",
            ),
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary_directory = root / "bin"
            binary_directory.mkdir()
            docker_log = root / "docker.log"
            fake_docker = binary_directory / "docker"
            fake_docker.write_text(
                """#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$DOCKER_LOG"
""",
                encoding="utf-8",
            )
            fake_docker.chmod(0o755)
            env_file = root / "mongodb.env"
            env_file.write_text(
                "MONGO_INITDB_ROOT_USERNAME=redacted-admin\n"
                "MONGO_INITDB_ROOT_PASSWORD=redacted-password\n",
                encoding="utf-8",
            )
            env_file.chmod(0o600)
            environment = {
                **os.environ,
                "DOCKER_LOG": str(docker_log),
                "MONGODB_BIND_IP": "10.0.100.237",
                "MONGODB_COMPOSE_FILE": str(MONGODB_COMPOSE),
                "MONGODB_ENV_FILE": str(env_file),
                "PATH": f"{binary_directory}:{os.environ['PATH']}",
            }

            for mode, expected_suffixes in cases.items():
                with self.subTest(mode=mode):
                    docker_log.write_text("", encoding="utf-8")
                    completed = subprocess.run(
                        ("/bin/bash", str(MONGODB_RUNNER), mode),
                        cwd=ROOT,
                        env=environment,
                        check=False,
                        capture_output=True,
                        text=True,
                    )

                    self.assertEqual(0, completed.returncode, completed.stderr)
                    invocations = docker_log.read_text(encoding="utf-8").splitlines()
                    self.assertEqual(len(expected_suffixes), len(invocations))
                    for invocation, suffix in zip(invocations, expected_suffixes):
                        self.assertTrue(invocation.endswith(suffix), invocation)


if __name__ == "__main__":
    unittest.main()
