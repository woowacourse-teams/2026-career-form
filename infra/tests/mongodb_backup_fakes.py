"""MongoDB 백업·복구 단위 시험의 합성 시나리오와 가짜 도구 설치."""
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import shlex
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
TOOL = Path(__file__).with_name("mongodb_backup_fake_tool.py")
NOW = int(datetime(2026, 11, 9, 19, 0, 0, tzinfo=timezone.utc).timestamp())
RUN = "20261109T190000Z"
HEADER = b"age-encryption.org/v1\n-> X25519 synthetic\n--- synthetic\n"
PASSWORD = "synthetic-backup-secret"
URI = f"mongodb://synthetic-backup:{PASSWORD}@127.0.0.1:27017/?authSource=admin"
CONTAINER = "synthetic-mongodb"
IMAGE = "mongo:8.0.26-noble@sha256:" + "a" * 64
IMAGE_ID = "sha256:" + "b" * 64
PROD = "synthetic_prod"
DEV = "synthetic_dev"
STAGING = "synthetic_staging"
REMOTE = "s3://techcourse-project-2026/career-form/mongodb-backups"
APP = {
    "execution_provider_policies": 1,
    "form_analysis_companies": 2,
    "form_analysis_policies": 3,
    "job_postings": 4,
    "push_deliveries": 5,
    "push_subscriptions": 2,
    "quality_records": 6,
    "quality_sessions": 1,
}
EVALUATION = {
    "evaluation_call_results": 3,
    "evaluation_prompt_snapshots": 1,
    "evaluation_provider_changes": 1,
    "evaluation_provider_registrations": 1,
    "evaluation_record_notes": 2,
    "evaluation_runs": 2,
    "evaluation_scorings": 1,
}
CHECKS = {
    "active_policies": [
        {"companyKey": "synthetic-a", "activePolicyVersion": 4, "policyExists": True},
        {"companyKey": "synthetic-b", "activePolicyVersion": 8, "policyExists": True},
    ],
    "push_subscriptions": 2,
    "permanent_quality_records": 3,
}


def hashes(collections: dict, salt: str) -> dict:
    return {name: hashlib.md5(f"{salt}:{name}".encode()).hexdigest() for name in collections}


def database(collections: dict, salt: str) -> dict:
    return {"collections": dict(collections), "hashes": hashes(collections, salt), "checks": CHECKS}


def scenario() -> dict:
    return {
        "uri": URI,
        "containers": {CONTAINER: {"image": IMAGE, "image_id": IMAGE_ID, "running": True}},
        "versions": {"mongodump": "100.17.0", "mongosh": "2.9.2"},
        "databases": {
            PROD: database(APP, "prod"),
            DEV: database({**APP, **EVALUATION}, "dev"),
            STAGING: database(APP, "staging"),
        },
        "fail": {},
    }


def install(directory: Path, data: dict) -> Path:
    home = directory / "fakebin"
    home.mkdir()
    (home / "scenario.json").write_text(json.dumps(data))
    for name in ("docker", "age", "aws"):
        launcher = home / name
        launcher.write_text(
            "#!/bin/sh\n"
            f"exec {shlex.quote(sys.executable)} {shlex.quote(str(TOOL))} {shlex.quote(str(home))} {name} \"$@\"\n"
        )
        launcher.chmod(0o755)
    return home


def update(home: Path, change) -> None:
    data = json.loads((home / "scenario.json").read_text())
    change(data)
    (home / "scenario.json").write_text(json.dumps(data))


def calls(home: Path, tool: str = None) -> list:
    path = home / "calls.jsonl"
    if not path.exists():
        return []
    entries = [json.loads(line) for line in path.read_text().splitlines()]
    return [entry for entry in entries if tool is None or entry["tool"] == tool]


def decrypt(data: bytes) -> bytes:
    if not data.startswith(HEADER):
        raise ValueError("not a synthetic age file")
    return base64.b64decode(data[len(HEADER):])


def write_env(path: Path, root: Path, state: Path, recipients: Path, mode: int = 0o600, **overrides) -> None:
    values = {
        "MONGODB_BACKUP_URI": URI,
        "MONGODB_BACKUP_CONTAINER": CONTAINER,
        "MONGODB_BACKUP_PROD_DATABASE": PROD,
        "MONGODB_BACKUP_DEV_DATABASE": DEV,
        "MONGODB_BACKUP_RECIPIENTS_FILE": str(recipients),
        "MONGODB_BACKUP_ROOT": str(root),
        "MONGODB_BACKUP_S3_URI": REMOTE,
        "MONGODB_BACKUP_S3_REGION": "ap-northeast-2",
        "MONGODB_BACKUP_RETENTION_DAYS": "7",
        "MONGODB_STATE_DIR": str(state),
    }
    values.update(overrides)
    path.write_text("".join(f"{key}={value}\n" for key, value in values.items() if value is not None))
    path.chmod(mode)


def option(args: list, name: str) -> list:
    values = []
    for index, value in enumerate(args):
        if value == name and index + 1 < len(args):
            values.append(args[index + 1])
        elif value.startswith(name + "="):
            values.append(value.split("=", 1)[1])
    return values


def load_script(filename: str, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, ROOT / "infra/scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_metrics(text: str) -> dict:
    values = {}
    for line in text.splitlines():
        name, value = line.rsplit(" ", 1)
        values[name] = float(value)
    return values


class BackupWorkspace:
    """합성 env 파일, 백업 루트, 상태 폴더, 가짜 도구를 갖춘 임시 작업 공간."""

    def __init__(self, testcase, data: dict = None, env_mode: int = 0o600, state: dict = None, **env):
        self._directory = tempfile.TemporaryDirectory(prefix="cf440-backup-")
        testcase.addCleanup(self._directory.cleanup)
        self.base = Path(self._directory.name)
        self.root = self.base / "backups"
        self.root.mkdir(mode=0o700)
        self.state = self.base / "state"
        self.state.mkdir()
        self.runtime = self.base / "runtime"
        self.runtime.mkdir(mode=0o700)
        self.recipients = self.base / "recipients.txt"
        self.recipients.write_text("age1synthetic0recipient\n")
        self.bin = install(self.base, data or scenario())
        self.env = self.base / "mongodb-backup.env"
        write_env(self.env, self.root, self.state, self.recipients, mode=env_mode, **env)
        if state is not None:
            (self.state / "mongodb-backup-state.json").write_text(json.dumps(state))

    def environment(self) -> dict:
        return {"PATH": f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}", "RUNTIME_DIRECTORY": str(self.runtime)}

    def run(self, module, argv: list = None, clock: int = NOW):
        output, errors = io.StringIO(), io.StringIO()
        arguments = argv if argv is not None else ["--env-file", str(self.env)]
        with mock.patch.dict(os.environ, self.environment()), contextlib.redirect_stdout(output), \
                contextlib.redirect_stderr(errors):
            code = module.main(arguments, clock=lambda: clock)
        return code, output.getvalue(), errors.getvalue()

    def run_dir(self, name: str = RUN) -> Path:
        return self.root / name

    def manifest(self, name: str = RUN) -> dict:
        return json.loads((self.run_dir(name) / "manifest.json").read_text())

    def metrics(self) -> dict:
        return parse_metrics((self.state / "mongodb-backup.prom").read_text())

    def calls(self, tool: str = None) -> list:
        return calls(self.bin, tool)

    def bucket(self) -> Path:
        return self.bin / "bucket"
