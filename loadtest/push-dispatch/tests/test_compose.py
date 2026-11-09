import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from pushload import testenv

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "compose.yaml"
PRODUCTION_MONGODB_IMAGE = "mongo:8.0.26-noble@sha256:b49841837cd7688885d7479d14a71733bacae4c99faaae615622384eaee045a0"
MOCK_IMAGE = "python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b"


def text():
    return COMPOSE.read_text(encoding="utf-8")


def port_entries(content):
    """`ports:` 아래 목록 항목을 모은다. YAML 파서 없이 들여쓰기로 구간을 나눈다."""
    entries, indent = [], None
    for line in content.splitlines():
        stripped = line.strip()
        current = len(line) - len(line.lstrip())
        if stripped == "ports:":
            indent = current
        elif indent is not None and stripped.startswith("- ") and current > indent:
            entries.append(stripped[2:].strip().strip('"'))
        elif indent is not None and stripped and current <= indent:
            indent = None
    return entries


def service_block(content, name):
    match = re.search(rf"^  {re.escape(name)}:\n(.*?)(?=^  [a-z-]+:\n|^\S)", content, re.MULTILINE | re.DOTALL)
    return match.group(1) if match else ""


class ComposeStaticTest(unittest.TestCase):
    def test_project_and_service_names(self):
        content = text()
        self.assertRegex(content, r"(?m)^name: cf-push-loadtest$")
        for name in ("mongodb", "mock-push", "backend"):
            with self.subTest(service=name):
                self.assertRegex(content, rf"(?m)^  {name}:$")

    def test_every_port_binds_to_loopback_only(self):
        entries = port_entries(text())
        self.assertEqual(4, len(entries))
        for entry in entries:
            with self.subTest(entry=entry):
                self.assertTrue(entry.startswith("127.0.0.1:"))

    def test_mongodb_is_standalone_production_image_by_default(self):
        content = text()
        self.assertNotIn("replSet", content)
        self.assertNotIn("--replSet", content)
        self.assertIn(f"image: ${{LOADTEST_MONGODB_IMAGE:-{PRODUCTION_MONGODB_IMAGE}}}", service_block(content, "mongodb"))
        self.assertNotRegex(service_block(content, "mongodb"), r"(?m)^\s+command:")

    def test_mock_server_mounts_only_its_code_and_run_folder(self):
        block = service_block(text(), "mock-push")
        self.assertIn(f"image: ${{LOADTEST_MOCK_IMAGE:-{MOCK_IMAGE}}}", block)
        self.assertIn("- ./mock-push-server.py:/app/mock-push-server.py:ro", block)
        self.assertIn("- ./pushload:/app/pushload:ro", block)
        self.assertRegex(block, r"source: \$\{LOADTEST_RUN_DIR:\?")
        self.assertNotIn(".env", block.replace("# 모의 서버 코드만 읽기 전용으로 넣는다. .env.loadtest와", ""))
        self.assertNotRegex(block, r"- \./?:")

    def test_backend_resources_and_build_are_variables(self):
        block = service_block(text(), "backend")
        for expected in ("cpus: ${LOADTEST_BACKEND_CPUS:-2}", "mem_limit: ${LOADTEST_BACKEND_MEMORY:-2g}",
                         "context: ${LOADTEST_BACKEND_CONTEXT:-../../backend}", "image: cf-push-loadtest-backend:${LOADTEST_BACKEND_TAG:-local}"):
            with self.subTest(expected=expected):
                self.assertIn(expected, block)

    def test_backend_secrets_are_required_variables_from_test_env(self):
        block = service_block(text(), "backend")
        for name in (name for name in testenv.ENV_VARIABLES if name.startswith("CAREER_FORM_")):
            with self.subTest(name=name):
                self.assertRegex(block, rf"(?m)^\s+{name}: \$\{{{name}:\?")

    def test_backend_keeps_app_dispatch_defaults(self):
        block = service_block(text(), "backend")
        for name in ("CAREER_FORM_PUSH_CONCURRENCY", "CAREER_FORM_PUSH_DISPATCH_INTERVAL", "MAX_PER_CYCLE", "CAREER_FORM_PUSH_LEASE"):
            with self.subTest(name=name):
                self.assertNotIn(name, block)
        self.assertIn('CAREER_FORM_OTEL_ENABLED: "false"', block)


def compose_available():
    if shutil.which("docker") is None:
        return False
    return subprocess.run(["docker", "compose", "version"], capture_output=True).returncode == 0


@unittest.skipUnless(compose_available(), "docker compose가 없어 건너뜁니다")
class ComposeConfigTest(unittest.TestCase):
    """compose가 생성한 설정 파일의 `$`를 글자 그대로 읽는지 확인한다. 값은 출력하지 않는다."""

    def config(self, env_path, run_dir):
        result = subprocess.run(["docker", "compose", "--env-file", str(env_path), "-f", str(COMPOSE), "config", "--format", "json"],
                                cwd=ROOT, capture_output=True, text=True, env={"PATH": os.environ["PATH"],
                                                                                "HOME": os.environ.get("HOME", ""),
                                                                                "LOADTEST_RUN_DIR": run_dir})
        self.assertEqual(0, result.returncode, "docker compose config가 실패했습니다")
        return json.loads(result.stdout)

    def test_reads_generated_env_file_literally(self):
        values = testenv.loadtest_env_values()
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env.loadtest"
            testenv.write_env_file(env_path, values)
            config = self.config(env_path, "runs/check")
        environment = config["services"]["backend"]["environment"]
        # config 출력은 다시 읽을 수 있게 글자 `$`를 `$$`로 감싼다. 변수로 해석됐다면 `$` 뒤 구간이 사라진다.
        for name in ("CAREER_FORM_QUALITY_PASSWORD_HASH", "CAREER_FORM_PUSH_VAPID_PRIVATE_KEY", "CAREER_FORM_PUSH_VAPID_PUBLIC_KEY"):
            with self.subTest(name=name):
                self.assertTrue(environment.get(name) == values[name].replace("$", "$$"), f"{name} 값이 그대로 전달되지 않았습니다")
        run_mount = [volume for volume in config["services"]["mock-push"]["volumes"] if volume["target"] == "/data"][0]
        self.assertEqual(str(ROOT / "runs" / "check"), run_mount["source"])
        self.assertEqual("2", str(config["services"]["backend"]["cpus"]).removesuffix(".0"))


if __name__ == "__main__":
    unittest.main()
