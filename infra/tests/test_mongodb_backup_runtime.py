import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from infra.tests import mongodb_backup_fakes as fakes


ROOT = Path(__file__).resolve().parents[2]
BACKUP = ROOT / "infra/scripts/mongodb-backup.py"
REHEARSAL = ROOT / "infra/scripts/mongodb-restore-rehearsal.py"
MONGO = os.environ.get("MONGODB_RUNTIME_IMAGE",
                       "mongo:8.0.26-noble@sha256:b49841837cd7688885d7479d14a71733bacae4c99faaae615622384eaee045a0")
ROOT_USER, ROOT_PASSWORD = "synthetic-root", "synthetic-root-password"
BACKUP_URI = "mongodb://synthetic-backup:synthetic-backup-password@127.0.0.1:27017/?authSource=admin"
APP = ("execution_provider_policies", "form_analysis_companies", "form_analysis_policies", "job_postings",
       "push_deliveries", "push_subscriptions", "quality_records", "quality_sessions")
EVALUATION = ("evaluation_call_results", "evaluation_prompt_snapshots", "evaluation_provider_changes",
              "evaluation_provider_registrations", "evaluation_record_notes", "evaluation_runs", "evaluation_scorings")
SEED = r"""
const future = new Date(Date.now() + 86400000);
function app(database, size) {
  const target = db.getSiblingDB(database);
  target.form_analysis_companies.insertMany([
    {companyKey: 'synthetic-a', host: 'a.invalid', activePolicyVersion: NumberLong(4)},
    {companyKey: 'synthetic-b', host: 'b.invalid', activePolicyVersion: NumberLong(8)}]);
  target.form_analysis_policies.insertMany([
    {companyKey: 'synthetic-a', version: NumberLong(3)}, {companyKey: 'synthetic-a', version: NumberLong(4)},
    {companyKey: 'synthetic-b', version: NumberLong(8)}]);
  target.execution_provider_policies.insertOne({provider: 'synthetic'});
  for (let index = 0; index < size; index += 1) {
    target.job_postings.insertOne({link: 'https://jobs.invalid/' + index, roles: ['backend']});
    target.push_deliveries.insertOne({postingId: 'p' + index, status: 'SENT'});
    target.push_subscriptions.insertOne({endpoint: 'https://push.invalid/' + index, keys: {p256dh: 'synthetic', auth: 'synthetic'}});
    target.quality_records.insertOne({kind: 'CONFIRMED', revision: index});
    target.quality_records.insertOne({kind: 'DETAIL', expiresAt: future});
    target.quality_sessions.insertOne({session: index});
  }
  target.quality_records.createIndex({expiresAt: 1}, {expireAfterSeconds: 0});
}
app('synthetic_prod', 20);
app('synthetic_dev', 5);
app('synthetic_staging', 3);
const dev = db.getSiblingDB('synthetic_dev');
EVALUATION.forEach((name, index) => { for (let item = 0; item <= index; item += 1) { dev.getCollection(name).insertOne({item: item}); } });
db.getSiblingDB('admin').createUser({user: 'synthetic-backup', pwd: 'synthetic-backup-password', roles: ['backup', 'readAnyDatabase']});
print('seeded');
"""


def kernel_needs_compat() -> bool:
    version = subprocess.run(["docker", "info", "--format", "{{.KernelVersion}}"], capture_output=True, text=True,
                             check=True).stdout.strip()
    match = re.match(r"(\d+)\.(\d+)", version)
    return bool(match) and (int(match.group(1)), int(match.group(2))) >= (6, 19)


@unittest.skipUnless(os.environ.get("RUN_MONGODB_INTEGRATION") == "1", "Explicit isolated synthetic MongoDB backup test")
class MongoDBBackupRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for tool in ("docker", "age", "age-keygen"):
            if shutil.which(tool) is None:
                raise RuntimeError(f"{tool} is required for the backup integration test")
        cls.workspace = tempfile.TemporaryDirectory(prefix="cf440-runtime-")
        cls.addClassCleanup(cls.workspace.cleanup)
        cls.base = Path(cls.workspace.name)
        cls.compat = kernel_needs_compat()
        cls.container = f"cf440-runtime-{os.getpid()}"
        cls.addClassCleanup(subprocess.run, ["docker", "rm", "-f", cls.container], capture_output=True)
        environment = ["-e", f"MONGO_INITDB_ROOT_USERNAME={ROOT_USER}", "-e", f"MONGO_INITDB_ROOT_PASSWORD={ROOT_PASSWORD}"]
        if cls.compat:
            environment += ["-e", "GLIBC_TUNABLES=glibc.pthread.rseq=1"]
        subprocess.run(["docker", "run", "-d", "--name", cls.container, *environment, MONGO], check=True,
                       capture_output=True)
        cls.wait(lambda: cls.mongo("db.adminCommand({ping: 1}).ok").stdout.strip().endswith("1"), 120)
        seeded = cls.mongo("const EVALUATION = " + json.dumps(list(EVALUATION)) + ";" + SEED)
        if "seeded" not in seeded.stdout:
            raise RuntimeError(seeded.stdout + seeded.stderr)
        cls.prepare_files()
        cls.started = time.monotonic()
        cls.backup = subprocess.run([sys.executable, str(BACKUP), "--env-file", str(cls.env)], capture_output=True,
                                    text=True, env=cls.environment(), timeout=600)
        cls.backup_seconds = round(time.monotonic() - cls.started, 3)
        cls.run_dir = next(cls.root.iterdir()) if cls.backup.returncode == 0 else None

    @classmethod
    def mongo(cls, script: str) -> subprocess.CompletedProcess:
        return subprocess.run(["docker", "exec", cls.container, "mongosh", "--quiet", "-u", ROOT_USER, "-p",
                               ROOT_PASSWORD, "--authenticationDatabase", "admin", "--eval", script],
                              capture_output=True, text=True, timeout=120)

    @staticmethod
    def wait(predicate, timeout: int) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if predicate():
                    return
            except subprocess.SubprocessError:
                pass
            time.sleep(1)
        raise TimeoutError("synthetic MongoDB did not become ready")

    @classmethod
    def prepare_files(cls):
        cls.root = cls.base / "backups"
        cls.root.mkdir(mode=0o700)
        cls.state = cls.base / "state"
        cls.state.mkdir()
        cls.runtime = cls.base / "runtime"
        cls.runtime.mkdir(mode=0o700)
        cls.identity = cls.base / "identity.txt"
        subprocess.run(["age-keygen", "-o", str(cls.identity)], check=True, capture_output=True)
        cls.identity.chmod(0o600)
        recipient = subprocess.run(["age-keygen", "-y", str(cls.identity)], check=True, capture_output=True,
                                   text=True).stdout
        cls.recipients = cls.base / "recipients.txt"
        cls.recipients.write_text(recipient)
        cls.fakebin = fakes.install(cls.base, {"fail": {}}, tools=("aws",))
        cls.env = cls.base / "mongodb-backup.env"
        fakes.write_env(cls.env, cls.root, cls.state, cls.recipients, MONGODB_BACKUP_URI=BACKUP_URI,
                        MONGODB_BACKUP_CONTAINER=cls.container, MONGODB_BACKUP_PROD_DATABASE="synthetic_prod",
                        MONGODB_BACKUP_DEV_DATABASE="synthetic_dev")

    @classmethod
    def environment(cls) -> dict:
        environment = {"PATH": f"{cls.fakebin}{os.pathsep}{os.environ['PATH']}", "HOME": str(cls.base),
                       "RUNTIME_DIRECTORY": str(cls.runtime)}
        for key in ("DOCKER_HOST", "DOCKER_CONFIG"):
            if key in os.environ:
                environment[key] = os.environ[key]
        return environment

    def rehearse(self, source: str, work: Path, *extra) -> subprocess.CompletedProcess:
        command = [sys.executable, str(REHEARSAL), "--source", source, "--identity", str(self.identity),
                   "--work-dir", str(work), "--protected-container", self.container, *extra]
        if self.compat:
            command.append("--kernel-compat")
        return subprocess.run(command, capture_output=True, text=True, env=self.environment(), timeout=900)

    def teardown(self, work: Path) -> None:
        result = subprocess.run([sys.executable, str(REHEARSAL), "--teardown", "--work-dir", str(work)],
                                capture_output=True, text=True, env=self.environment(), timeout=120)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertFalse(work.exists())

    def test_backup_writes_private_encrypted_run_with_expected_scope(self):
        self.assertEqual(0, self.backup.returncode, self.backup.stdout + self.backup.stderr)
        self.assertEqual(0o700, self.run_dir.stat().st_mode & 0o777)
        names = sorted(path.name for path in self.run_dir.iterdir())
        self.assertEqual(["dev.archive.gz.age", "manifest.json", "manifest.json.age", "prod.archive.gz.age"], names)
        for path in self.run_dir.iterdir():
            self.assertEqual(0o600, path.stat().st_mode & 0o777)
            if path.suffix == ".age":
                self.assertTrue(path.read_bytes().startswith(b"age-encryption.org/v1\n"))
        self.assertEqual([], list(self.runtime.iterdir()))
        manifest = json.loads((self.run_dir / "manifest.json").read_text())
        self.assertEqual({"prod", "dev"}, set(manifest["targets"]))
        self.assertEqual(sorted(APP), sorted(manifest["targets"]["prod"]["collections"]))
        self.assertEqual(sorted(EVALUATION), sorted(manifest["targets"]["dev"]["collections"]))
        self.assertEqual(sorted(APP), manifest["targets"]["dev"]["excluded_collections"])
        self.assertNotIn("synthetic_staging", (self.run_dir / "manifest.json").read_text())
        prod = manifest["targets"]["prod"]
        self.assertEqual(20, prod["collections"]["job_postings"]["documents"])
        self.assertEqual(40, prod["collections"]["quality_records"]["documents"])
        self.assertFalse(any(item["changed_during_dump"] for item in prod["collections"].values()))
        self.assertEqual({"active_policies": [
            {"companyKey": "synthetic-a", "activePolicyVersion": 4, "policyExists": True},
            {"companyKey": "synthetic-b", "activePolicyVersion": 8, "policyExists": True}],
            "push_subscriptions": 20, "permanent_quality_records": 20, "stable": True}, prod["checks"])
        self.assertEqual("100.17.0", manifest["tools"]["mongodump"])
        uploaded = sorted(path.name for path in (self.fakebin / "bucket/techcourse-project-2026/career-form/mongodb-backups"
                                                 / self.run_dir.name).iterdir())
        self.assertEqual(["dev.archive.gz.age", "manifest.json.age", "prod.archive.gz.age"], uploaded)
        metrics = fakes.parse_metrics((self.state / "mongodb-backup.prom").read_text())
        self.assertEqual(1, metrics["career_mongo_backup_success"])
        self.assertNotIn("synthetic-backup-password", self.backup.stdout + self.backup.stderr)
        sys.stderr.write(f"\nbackup: {self.backup_seconds}s, sizes "
                         f"{ {name: (self.run_dir / name).stat().st_size for name in names} }\n")

    def test_rehearsal_restores_host_run_into_networkless_container_and_tears_down(self):
        self.assertEqual(0, self.backup.returncode, self.backup.stdout + self.backup.stderr)
        work = self.base / "rehearsal-host"
        result = self.rehearse(str(self.run_dir), work)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        report = json.loads((work / "report.json").read_text())
        self.assertEqual("success", report["result"])
        self.assertEqual(["fetch", "start", "restore", "verify"], [stage["name"] for stage in report["stages"]])
        self.assertEqual([], [item for item in report["checks"] if item["result"] != "pass"])
        inspected = subprocess.run(["docker", "inspect", "--format", "{{.HostConfig.NetworkMode}} {{.HostConfig.Memory}}",
                                    report["container"]], capture_output=True, text=True, check=True).stdout.split()
        self.assertEqual(["none", str(512 * 1024 * 1024)], inspected)
        subprocess.run(["docker", "start", report["container"]], check=True, capture_output=True)
        self.wait(lambda: subprocess.run(["docker", "exec", report["container"], "mongosh", "--quiet", "--eval",
                                          "db.adminCommand({ping: 1}).ok"], capture_output=True, text=True)
                  .stdout.strip().endswith("1"), 120)
        listing = subprocess.run(["docker", "exec", report["container"], "mongosh", "--quiet", "--eval",
                                  "EJSON.stringify({databases: db.adminCommand({listDatabases: 1, nameOnly: true})"
                                  ".databases.map((d) => d.name).sort(), dev: db.getSiblingDB('synthetic_dev')"
                                  ".getCollectionNames().sort()})"], capture_output=True, text=True, check=True)
        restored = json.loads(listing.stdout.strip().splitlines()[-1])
        self.assertNotIn("synthetic_staging", restored["databases"])
        self.assertIn("synthetic_prod", restored["databases"])
        self.assertEqual(sorted(EVALUATION), restored["dev"])
        sys.stderr.write("\n" + result.stdout[:result.stdout.index("{")])
        self.teardown(work)
        gone = subprocess.run(["docker", "container", "inspect", report["container"]], capture_output=True)
        self.assertNotEqual(0, gone.returncode)

    def test_rehearsal_restores_from_remote_copy(self):
        self.assertEqual(0, self.backup.returncode, self.backup.stdout + self.backup.stderr)
        work = self.base / "rehearsal-remote"
        result = self.rehearse(f"{fakes.REMOTE}/{self.run_dir.name}/", work)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual("success", json.loads((work / "report.json").read_text())["result"])
        self.teardown(work)

    def test_rehearsal_rejects_tampered_archive_before_starting_mongod(self):
        self.assertEqual(0, self.backup.returncode, self.backup.stdout + self.backup.stderr)
        tampered = self.base / "tampered"
        shutil.copytree(self.run_dir, tampered)
        archive = tampered / "prod.archive.gz.age"
        data = bytearray(archive.read_bytes())
        data[-1] ^= 0xFF
        archive.write_bytes(bytes(data))
        work = self.base / "rehearsal-tampered"
        result = self.rehearse(str(tampered), work)
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        report = json.loads((work / "report.json").read_text())
        self.assertEqual("fetch", report["failed_stage"])
        missing = subprocess.run(["docker", "container", "inspect", report["container"]], capture_output=True)
        self.assertNotEqual(0, missing.returncode)
        self.teardown(work)


if __name__ == "__main__":
    unittest.main()
