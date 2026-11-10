#!/usr/bin/env python3
"""Career Form MongoDB 백업본 복구 리허설.

백업 실행 폴더(호스트 폴더 또는 공용 버킷 경로)를 새 작업 폴더에서 받아 체크섬을 확인하고,
네트워크 없는 임시 mongod 컨테이너에 복원한 뒤 manifest와 정합을 비교한다. 운영 컨테이너와
운영 데이터 폴더에는 손대지 않는다. 결과는 단계별 소요 시간 표와 JSON으로 출력한다.

    mongodb-restore-rehearsal.py --source <실행 폴더|s3://…/<run>/> --identity <age identity> --work-dir <새 폴더>
    mongodb-restore-rehearsal.py --teardown --work-dir <리허설 폴더>
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_PROTECTED_PATHS = (Path("/var/lib/career-form/mongodb"),)
# 운영 호스트의 실제 이름(compose 프로젝트 mongodb)과 compose 도우미 기본 프로젝트의 이름.
DEFAULT_PROTECTED_CONTAINERS = ("mongodb-mongodb-1", "career-form-mongodb-mongodb-1")
LABEL = "career-form.rehearsal"
MARKER = ".career-form-rehearsal.json"
COMMAND_TIMEOUT = 1800
CONTAINER_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
REMOTE = re.compile(r"^s3://[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]/[A-Za-z0-9!_.*'()/-]+/?$")
MEMORY = re.compile(r"^\d+[mg]$")
FILE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.age$")
RESTORE_SUMMARY = re.compile(r"(\d+) document\(s\) restored successfully\. (\d+) document\(s\) failed to restore")

RESTORED_QUERY = r"""
const request = /*request*/%s/*request*/;
const target = db.getSiblingDB(request.database);
let result;
if (request.action === 'collections') {
  const names = target.getCollectionInfos({type: 'collection'}, {nameOnly: true})
    .map((info) => info.name).filter((name) => !name.startsWith('system.')).sort();
  result = {counts: Object.fromEntries(names.map((name) => [name, target.getCollection(name).countDocuments({})]))};
} else if (request.action === 'hash') {
  const reply = target.runCommand({dbHash: 1, collections: request.collections});
  if (reply.ok !== 1) { throw new Error('dbHash failed'); }
  result = {collections: reply.collections || {}};
} else if (request.action === 'checks') {
  const policies = target.getCollection('form_analysis_policies');
  const companies = target.getCollection('form_analysis_companies')
    .find({}, {_id: 0, companyKey: 1, activePolicyVersion: 1}).sort({companyKey: 1}).toArray();
  result = {
    active_policies: companies.map((company) => ({
      companyKey: company.companyKey,
      activePolicyVersion: company.activePolicyVersion,
      policyExists: policies.countDocuments({companyKey: company.companyKey, version: company.activePolicyVersion}) > 0,
    })),
    push_subscriptions: target.getCollection('push_subscriptions').countDocuments({}),
    permanent_quality_records: target.getCollection('quality_records').countDocuments({expiresAt: null}),
  };
} else {
  throw new Error('unknown action');
}
print(EJSON.stringify(result, {relaxed: true}));
"""


class Refused(Exception):
    """운영 자원이나 스크립트가 만들지 않은 자원을 가리켜 실행을 거부한다."""


class StageError(Exception):
    """리허설 단계가 실패했다."""


def iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def real(path) -> Path:
    return Path(os.path.realpath(path))


def within(path: Path, parent: Path) -> bool:
    return path == parent or parent in path.parents


def child_environment() -> dict:
    environment = {key: os.environ[key] for key in ("PATH", "HOME", "LANG", "DOCKER_HOST", "DOCKER_CONFIG")
                   if key in os.environ}
    environment.setdefault("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
    environment.setdefault("LANG", "C.UTF-8")
    return environment


def tail(data) -> str:
    text = data.decode("utf-8", "replace") if isinstance(data, bytes) else data
    lines = [line.strip()[:300] for line in text.splitlines() if line.strip()]
    return " | ".join(lines[-5:]) or "no error output"


def run(args: list, timeout: int = COMMAND_TIMEOUT) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(args, capture_output=True, env=child_environment(), timeout=timeout, check=False)
    except FileNotFoundError:
        raise StageError(f"{args[0]} command is not installed") from None
    except subprocess.TimeoutExpired:
        raise StageError(f"{' '.join(args[:2])} timed out") from None


def checked(args: list) -> bytes:
    completed = run(args)
    if completed.returncode != 0:
        raise StageError(f"{' '.join(args[:2])} exited {completed.returncode}: {tail(completed.stderr)}")
    return completed.stdout


def container_labels(name: str):
    """컨테이너가 없으면 None, 있으면 라벨 사전."""
    completed = run(["docker", "container", "inspect", "--format", "{{json .Config.Labels}}", name], timeout=60)
    if completed.returncode != 0:
        return None
    try:
        labels = json.loads(completed.stdout.decode("utf-8", "replace").strip() or "null")
    except ValueError:
        return {}
    return labels if isinstance(labels, dict) else {}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def write_private(path: Path, content: str) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(content)


def guard_location(path: Path, protected_paths) -> None:
    resolved = real(path)
    for item in protected_paths:
        protected = real(item)
        if within(resolved, protected):
            raise Refused(f"{path} is inside protected path {item}")
        if within(protected, resolved):
            raise Refused(f"{path} contains protected path {item}")


def versions(policies) -> dict:
    return {item.get("companyKey"): item.get("activePolicyVersion") for item in policies or []}


def compare_target(target: str, expected: dict, observed: dict) -> list:
    """manifest의 대상 하나와 복원 결과를 비교해 확인 항목 목록을 돌려준다."""
    results = []

    def add(check, wanted, got, outcome):
        results.append({"target": target, "check": check, "expected": wanted, "observed": got, "result": outcome})

    collections = expected.get("collections", {})
    counts = observed.get("counts") or {}
    for name, item in sorted(collections.items()):
        got = counts.get(name)
        add(f"count {name}", item["documents"], got, "pass" if got == item["documents"] else "fail")
    extra = sorted(set(counts) - set(collections))
    add("unexpected collections", [], extra, "fail" if extra else "pass")
    hashes = observed.get("hashes") or {}
    for name, item in sorted(collections.items()):
        if item.get("changed_during_dump"):
            add(f"dbHash {name}", item.get("hash_after"), hashes.get(name), "skip")
        else:
            got = hashes.get(name)
            add(f"dbHash {name}", item["hash_before"], got, "pass" if got == item["hash_before"] else "fail")
    if "checks" in expected:
        wanted = expected["checks"]
        got = observed.get("checks") or {}
        stable = wanted.get("stable") is True

        def strict(check, left, right):
            add(check, left, right, ("pass" if left == right else "fail") if stable else "skip")

        strict("active policy versions", versions(wanted.get("active_policies")), versions(got.get("active_policies")))
        missing = [item.get("companyKey") for item in got.get("active_policies") or [] if not item.get("policyExists")]
        present = "active_policies" in got and not missing
        add("active policy documents", [], missing, "pass" if present else "fail")
        strict("push_subscriptions", wanted.get("push_subscriptions"), got.get("push_subscriptions"))
        strict("permanent quality records", wanted.get("permanent_quality_records"),
               got.get("permanent_quality_records"))
    return results


def display(value) -> str:
    if value is None:
        return "-"
    if isinstance(value, dict):
        text = ",".join(f"{key}:{item}" for key, item in value.items()) or "-"
    elif isinstance(value, list):
        text = ",".join(display(item) for item in value) or "-"
    else:
        text = str(value)
    return text if len(text) <= 48 else text[:45] + "..."


def render_table(report: dict) -> str:
    lines = [f"{'단계':<8}  {'시작(UTC)':<20}  {'종료(UTC)':<20}  {'소요(초)':>8}  결과"]
    for stage in report["stages"]:
        lines.append(f"{stage['name']:<8}  {stage['started_at']:<20}  {stage['finished_at']:<20}  "
                     f"{stage['seconds']:>8}  {stage['result']}")
    lines.append(f"{'합계':<8}  {'':<20}  {'':<20}  {report['total_seconds']:>8}")
    lines.append("")
    lines.append(f"{'대상':<4}  {'결과':<4}  {'확인':<36}  {'기대':<20}  실제")
    for item in report["checks"]:
        lines.append(f"{item['target']:<4}  {item['result']:<4}  {item['check']:<36}  "
                     f"{display(item['expected']):<20}  {display(item['observed'])}")
    failed = sum(1 for item in report["checks"] if item["result"] == "fail")
    skipped = sum(1 for item in report["checks"] if item["result"] == "skip")
    lines.append(f"결과: {report['result']} (확인 {len(report['checks'])}건, 실패 {failed}건, 건너뜀 {skipped}건)")
    return "\n".join(lines)


class Rehearsal:
    READY_TIMEOUT = 120
    READY_INTERVAL = 1

    def __init__(self, args: argparse.Namespace, clock, protected_paths, protected_containers):
        self.clock = clock
        self.remote = args.source.startswith("s3://")
        self.source = args.source
        self.region = args.region
        self.memory = args.memory
        self.cache = args.cache_gb
        self.kernel_compat = args.kernel_compat
        self.image = args.image
        self.identity = Path(args.identity).absolute()
        self.work = Path(args.work_dir).absolute()
        self.id = uuid.uuid4().hex[:12]
        self.name = args.name or f"cf-rehearsal-{self.id}"
        self.validate(protected_paths, protected_containers)
        self.source_dir = None
        self.manifest = None
        self.started = False
        self.report = {"id": self.id, "container": self.name, "work_dir": str(self.work), "source": self.source,
                       "run": None, "image": None, "stages": [], "checks": [], "result": "failure"}

    def validate(self, protected_paths, protected_containers) -> None:
        if self.remote:
            if not REMOTE.fullmatch(self.source):
                raise Refused("remote source must be s3://<bucket>/<prefix>/<run>/")
        else:
            source = Path(self.source).absolute()
            guard_location(source, protected_paths)
            self.source = str(source)
        if not MEMORY.fullmatch(self.memory):
            raise Refused("--memory must look like 512m or 1g")
        try:
            if not 0.25 <= float(self.cache) <= 64:
                raise ValueError
        except ValueError:
            raise Refused("--cache-gb must be between 0.25 and 64") from None
        if not self.identity.is_file() or self.identity.stat().st_mode & 0o077:
            raise Refused("identity must be a file readable only by its owner")
        if os.path.islink(self.work):
            raise Refused("work dir must not be a symbolic link")
        guard_location(self.work, protected_paths)
        if not self.remote and within(real(self.work), real(self.source)):
            raise Refused("work dir must not be inside the source folder")
        if self.work.exists() and (not self.work.is_dir() or any(self.work.iterdir())):
            raise Refused(f"work dir {self.work} must be a new empty folder")
        if not self.work.parent.is_dir():
            raise Refused(f"parent of work dir {self.work} does not exist")
        if self.name in protected_containers or not CONTAINER_NAME.fullmatch(self.name):
            raise Refused(f"container name {self.name} is protected or invalid")
        if container_labels(self.name) is not None:
            raise Refused(f"container {self.name} already exists")

    def add(self, target: str, check: str, expected, observed) -> bool:
        passed = expected == observed
        self.report["checks"].append({"target": target, "check": check, "expected": expected, "observed": observed,
                                      "result": "pass" if passed else "fail"})
        return passed

    def stage(self, name: str, function) -> None:
        started = self.clock()
        outcome = "pass"
        try:
            function()
        except (StageError, OSError, KeyError, TypeError, ValueError, subprocess.SubprocessError) as error:
            outcome = "fail"
            self.report["failed_stage"] = name
            if isinstance(error, StageError):
                self.report["error"] = str(error)
            else:
                detail = error.strerror if isinstance(error, OSError) and error.strerror else str(error)
                self.report["error"] = f"unexpected {type(error).__name__}: {detail}"
            raise StageError(self.report["error"]) from error
        finally:
            finished = self.clock()
            self.report["stages"].append({"name": name, "started_at": iso(started), "finished_at": iso(finished),
                                          "seconds": round(finished - started, 3), "result": outcome})

    def prepare(self) -> None:
        if self.work.exists():
            os.chmod(self.work, 0o700)
        else:
            os.mkdir(self.work, 0o700)
            os.chmod(self.work, 0o700)
        write_private(self.work / MARKER, json.dumps({"id": self.id, "container": self.name,
                                                      "created_at": iso(time.time())}) + "\n")

    def fetch(self) -> None:
        if self.remote:
            download = self.work / "download"
            os.mkdir(download, 0o700)
            checked(["aws", "s3", "cp", self.source, str(download), "--recursive", "--region", self.region,
                     "--only-show-errors"])
            self.source_dir = download
        else:
            self.source_dir = Path(self.source)
        encrypted = self.source_dir / "manifest.json.age"
        if not encrypted.is_file():
            raise StageError("manifest.json.age is missing")
        try:
            self.manifest = json.loads(checked(["age", "-d", "-i", str(self.identity), str(encrypted)]))
        except ValueError:
            raise StageError("manifest is not valid JSON") from None
        write_private(self.work / "manifest.json", json.dumps(self.manifest, ensure_ascii=False, indent=2) + "\n")
        self.report["run"] = self.manifest.get("run")
        passed = True
        for target, entry in self.manifest.get("targets", {}).items():
            if not FILE_NAME.fullmatch(entry.get("file", "")):
                raise StageError(f"manifest file name for {target} is invalid")
            archive = self.source_dir / entry["file"]
            exists = archive.is_file() and not archive.is_symlink()
            passed &= self.add(target, "size", entry.get("size_bytes"), archive.stat().st_size if exists else None)
            passed &= self.add(target, "sha256", entry.get("sha256"), sha256(archive) if exists else None)
        if not self.manifest.get("targets"):
            raise StageError("manifest has no targets")
        if not passed:
            raise StageError("archive size or checksum differs from the manifest")

    def start(self) -> None:
        image = self.image or self.manifest.get("image")
        if not image:
            raise StageError("manifest has no image and --image was not given")
        self.report["image"] = image
        data = self.work / "data"
        os.mkdir(data, 0o700)
        command = ["docker", "run", "-d", "--name", self.name, "--label", f"{LABEL}={self.id}", "--network", "none",
                   "--memory", self.memory, "--memory-swap", self.memory, "-v", f"{data}:/data/db"]
        if self.kernel_compat:
            command += ["-e", "GLIBC_TUNABLES=glibc.pthread.rseq=1"]
        command += [image, "mongod", "--bind_ip", "127.0.0.1", "--wiredTigerCacheSizeGB", str(self.cache),
                    "--setParameter", "ttlMonitorEnabled=false"]
        checked(command)
        self.started = True
        deadline = time.monotonic() + self.READY_TIMEOUT
        while True:
            completed = run(["docker", "exec", self.name, "mongosh", "--quiet", "--eval",
                             "db.adminCommand({ping: 1}).ok"], timeout=60)
            if completed.returncode == 0 and completed.stdout.decode("utf-8", "replace").strip().endswith("1"):
                return
            if time.monotonic() >= deadline:
                raise StageError(f"temporary mongod did not become ready: {tail(completed.stderr)}")
            time.sleep(self.READY_INTERVAL)

    def restore(self) -> None:
        environment = child_environment()
        restored = {}
        for target, entry in self.manifest["targets"].items():
            archive = self.source_dir / entry["file"]
            with tempfile.TemporaryFile(dir=self.work) as decrypt_errors, \
                    tempfile.TemporaryFile(dir=self.work) as restore_errors:
                decrypt = subprocess.Popen(["age", "-d", "-i", str(self.identity), str(archive)],
                                           stdout=subprocess.PIPE, stderr=decrypt_errors, env=environment)
                try:
                    load = subprocess.Popen(["docker", "exec", "-i", self.name, "mongorestore", "--archive", "--gzip",
                                             "--stopOnError"], stdin=decrypt.stdout, stdout=subprocess.DEVNULL,
                                            stderr=restore_errors, env=environment)
                except OSError:
                    decrypt.kill()
                    decrypt.wait()
                    raise
                decrypt.stdout.close()
                load_code = load.wait(timeout=COMMAND_TIMEOUT)
                decrypt_code = decrypt.wait(timeout=COMMAND_TIMEOUT)
                decrypt_errors.seek(0)
                restore_errors.seek(0)
                decrypt_report, restore_report = decrypt_errors.read(), restore_errors.read()
            if decrypt_code != 0:
                raise StageError(f"age could not decrypt {entry['file']}: {tail(decrypt_report)}")
            if load_code != 0:
                raise StageError(f"mongorestore failed for {target}: {tail(restore_report)}")
            summary = RESTORE_SUMMARY.search(restore_report.decode("utf-8", "replace"))
            restored[target] = {"documents": int(summary.group(1)) if summary else None,
                                "failed": int(summary.group(2)) if summary else 0}
            if restored[target]["failed"]:
                raise StageError(f"mongorestore reported failed documents for {target}")
        self.report["restored"] = restored

    def query(self, request: dict) -> dict:
        output = checked(["docker", "exec", self.name, "mongosh", "--quiet", "--eval",
                          RESTORED_QUERY % json.dumps(request)])
        lines = [line for line in output.decode("utf-8", "replace").splitlines() if line.strip()]
        try:
            return json.loads(lines[-1])
        except (IndexError, ValueError):
            raise StageError(f"unexpected mongosh output for {request['action']}") from None

    def verify(self) -> None:
        results = []
        for target, entry in self.manifest["targets"].items():
            database = entry["database"]
            observed = {"counts": self.query({"action": "collections", "database": database})["counts"]}
            names = sorted(entry.get("collections", {}))
            observed["hashes"] = self.query({"action": "hash", "database": database,
                                             "collections": names})["collections"] if names else {}
            observed["checks"] = self.query({"action": "checks", "database": database}) if "checks" in entry else None
            results += compare_target(target, entry, observed)
        self.report["checks"] += results
        if any(item["result"] == "fail" for item in results):
            raise StageError("restored data does not match the manifest")

    def execute(self) -> int:
        self.prepare()
        self.report["started_at"] = iso(time.time())
        try:
            for name, function in (("fetch", self.fetch), ("start", self.start), ("restore", self.restore),
                                   ("verify", self.verify)):
                self.stage(name, function)
            self.report["result"] = "success"
        except StageError:
            self.report["result"] = "failure"
        finally:
            if self.started:
                run(["docker", "stop", self.name], timeout=120)
        self.report["finished_at"] = iso(time.time())
        self.report["total_seconds"] = round(sum(stage["seconds"] for stage in self.report["stages"]), 3)
        content = json.dumps(self.report, ensure_ascii=False, indent=2, sort_keys=True)
        write_private(self.work / "report.json", content + "\n")
        print(render_table(self.report))
        print(content)
        return 0 if self.report["result"] == "success" else 1


def teardown(work_dir: str, protected_paths, protected_containers) -> int:
    work = Path(work_dir).absolute()
    if os.path.islink(work) or not work.is_dir():
        raise Refused(f"{work} is not a rehearsal folder")
    guard_location(work, protected_paths)
    try:
        marker = json.loads((work / MARKER).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise Refused(f"{work} has no rehearsal marker") from None
    identifier, name = marker.get("id"), marker.get("container")
    if not identifier or not isinstance(name, str) or not CONTAINER_NAME.fullmatch(name):
        raise Refused("rehearsal marker is invalid")
    if name in protected_containers:
        raise Refused(f"container {name} is protected")
    labels = container_labels(name)
    if labels is not None:
        if labels.get(LABEL) != identifier:
            raise Refused(f"container {name} was not created by this rehearsal")
        try:
            checked(["docker", "rm", "-f", name])
        except StageError as error:
            print(f"teardown failed: {error}", file=sys.stderr)
            return 1
    shutil.rmtree(work)
    print(f"removed container {name if labels is not None else '(already gone)'} and folder {work}")
    return 0


def parse_arguments(argv) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Career Form MongoDB restore rehearsal in a temporary container")
    parser.add_argument("--source", help="backup run folder or s3://<bucket>/<prefix>/<run>/")
    parser.add_argument("--identity", help="age identity file used only for decryption")
    parser.add_argument("--work-dir", required=True, help="new empty folder for the rehearsal")
    parser.add_argument("--image", help="override the MongoDB image recorded in the manifest")
    parser.add_argument("--memory", default="512m", help="memory limit of the temporary container")
    parser.add_argument("--cache-gb", default="0.25", help="WiredTiger cache size of the temporary mongod")
    parser.add_argument("--kernel-compat", action="store_true",
                        help="start mongod with glibc rseq enabled on Linux kernel 6.19+ (slower allocator)")
    parser.add_argument("--region", default="ap-northeast-2", help="region of the remote source")
    parser.add_argument("--name", help="temporary container name (default cf-rehearsal-<id>)")
    parser.add_argument("--protected-path", action="append", default=[], help="extra path the rehearsal must not touch")
    parser.add_argument("--protected-container", action="append", default=[],
                        help="extra container the rehearsal must not touch")
    parser.add_argument("--teardown", action="store_true", help="remove the container and folder of a rehearsal")
    arguments = parser.parse_args(argv)
    if not arguments.teardown and (not arguments.source or not arguments.identity):
        parser.error("--source and --identity are required unless --teardown is given")
    return arguments


def main(argv=None, clock=time.time) -> int:
    arguments = parse_arguments(argv)
    protected_paths = [Path(path) for path in arguments.protected_path] + list(DEFAULT_PROTECTED_PATHS)
    protected_containers = list(arguments.protected_container) + list(DEFAULT_PROTECTED_CONTAINERS)
    try:
        if arguments.teardown:
            return teardown(arguments.work_dir, protected_paths, protected_containers)
        return Rehearsal(arguments, clock, protected_paths, protected_containers).execute()
    except Refused as error:
        print(f"refused: {error}", file=sys.stderr)
        return 2
    except (StageError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
