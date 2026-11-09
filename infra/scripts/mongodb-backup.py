#!/usr/bin/env python3
"""Career Form MongoDB 정기 백업.

prod DB 전체와 dev의 evaluation_ 컬렉션을 운영 컨테이너와 같은 이미지의 임시 컨테이너에서
mongodump로 덤프하고, 평문을 디스크에 쓰지 않은 채 age로 암호화해 실행 폴더에 남긴다.
설정과 비밀값은 0600 env 파일에서만 읽는다. 결과는 MONGODB_STATE_DIR/mongodb-backup.prom으로
내보내 기존 Alloy textfile 수집이 중앙으로 보낸다.
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
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_ENV_FILE = Path("/etc/career-form/mongodb-backup.env")
DEFAULT_STATE_DIR = Path("/var/lib/career-form/mongodb-observation")
MOUNT = "/run/cf-backup"
METRICS_FILE = "mongodb-backup.prom"
STATE_FILE = "mongodb-backup-state.json"
EVALUATION_PREFIX = "evaluation_"
COMMAND_TIMEOUT = 1800
TARGETS = (("prod", "MONGODB_BACKUP_PROD_DATABASE"), ("dev", "MONGODB_BACKUP_DEV_DATABASE"))
REQUIRED = (
    "MONGODB_BACKUP_URI",
    "MONGODB_BACKUP_CONTAINER",
    "MONGODB_BACKUP_PROD_DATABASE",
    "MONGODB_BACKUP_DEV_DATABASE",
    "MONGODB_BACKUP_RECIPIENTS_FILE",
    "MONGODB_BACKUP_ROOT",
    "MONGODB_BACKUP_S3_URI",
    "MONGODB_BACKUP_S3_REGION",
    "MONGODB_BACKUP_RETENTION_DAYS",
    "MONGODB_STATE_DIR",
)
STAGES = ("config", "prepare", "inspect", "dump", "manifest", "upload", "retention", "state")
AGE_HEADER = b"age-encryption.org/v1\n"
RUN_PATTERN = re.compile(r"^\d{8}T\d{6}Z$")
BACKUP_ROLE = re.compile(r":assumed-role/ec2-project/")
IDENTIFIER = re.compile(r"^[A-Za-z0-9_]+$")
CONTAINER_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
PREFIX = re.compile(r"^[A-Za-z0-9!_.*'()-]+(/[A-Za-z0-9!_.*'()-]+)*$")
REGION = re.compile(r"^[a-z]{2}(-[a-z]+)+-\d$")
DUMP_DONE = re.compile(r"done dumping `([^`]+)` \((\d+) documents?\)")
URI_TEXT = re.compile(r"mongodb(?:\+srv)?://\S+")

INSPECT_TEMPLATE = ('{"image":{{json .Config.Image}},"image_id":{{json .Image}},"running":{{json .State.Running}},'
                    '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}')

QUERY_SCRIPT = r"""
const fs = require('fs');
const base = '/run/cf-backup/';
const request = JSON.parse(fs.readFileSync(base + 'request.json', 'utf8'));
const client = new Mongo(fs.readFileSync(base + 'uri', 'utf8').trim());
const target = client.getDB(request.database);
let result;
if (request.action === 'collections') {
  result = {names: target.getCollectionInfos({type: 'collection'}, {nameOnly: true})
    .map((info) => info.name).filter((name) => !name.startsWith('system.')).sort()};
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


class BackupError(Exception):
    def __init__(self, stage: str, reason: str):
        super().__init__(f"{stage}: {reason}")
        self.stage = stage
        self.reason = reason


@dataclass(frozen=True)
class Config:
    uri: str
    container: str
    databases: dict
    recipients: Path
    root: Path
    bucket: str
    prefix: str
    region: str
    retention_days: int
    state_dir: Path

    @property
    def remote(self) -> str:
        return f"s3://{self.bucket}/{self.prefix}"

    def secrets(self) -> list:
        return secret_values(self.uri)


def parse_env(text: str) -> dict:
    values = {}
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, separator, value = stripped.partition("=")
        if not separator or not IDENTIFIER.fullmatch(key.strip()):
            raise ValueError(f"line {number} is not KEY=VALUE")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def load_config(path: Path) -> Config:
    path = Path(path)
    try:
        mode = path.stat().st_mode & 0o777
    except OSError:
        raise BackupError("config", "env file is missing or unreadable") from None
    if mode != 0o600:
        raise BackupError("config", f"env file mode must be 600, found {mode:o}")
    try:
        values = parse_env(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValueError) as error:
        raise BackupError("config", f"env file cannot be parsed: {error}") from None
    missing = [key for key in REQUIRED if not values.get(key)]
    if missing:
        raise BackupError("config", "missing settings: " + ", ".join(missing))
    uri = values["MONGODB_BACKUP_URI"]
    if not uri.startswith(("mongodb://", "mongodb+srv://")):
        raise BackupError("config", "MONGODB_BACKUP_URI must start with mongodb://")
    container = values["MONGODB_BACKUP_CONTAINER"]
    if not CONTAINER_NAME.fullmatch(container):
        raise BackupError("config", "MONGODB_BACKUP_CONTAINER must be a container name")
    databases = {target: values[key] for target, key in TARGETS}
    for target, key in TARGETS:
        if not IDENTIFIER.fullmatch(databases[target]):
            raise BackupError("config", f"{key} must contain only letters, digits and underscores")
    if len(set(databases.values())) != len(databases):
        raise BackupError("config", "prod and dev databases must differ")
    bucket, prefix = parse_s3_uri(values["MONGODB_BACKUP_S3_URI"])
    region = values["MONGODB_BACKUP_S3_REGION"]
    if not REGION.fullmatch(region):
        raise BackupError("config", "MONGODB_BACKUP_S3_REGION must be an AWS region name")
    try:
        retention_days = int(values["MONGODB_BACKUP_RETENTION_DAYS"])
    except ValueError:
        raise BackupError("config", "MONGODB_BACKUP_RETENTION_DAYS must be an integer") from None
    if not 1 <= retention_days <= 365:
        raise BackupError("config", "MONGODB_BACKUP_RETENTION_DAYS must be between 1 and 365")
    paths = {}
    for key in ("MONGODB_BACKUP_RECIPIENTS_FILE", "MONGODB_BACKUP_ROOT", "MONGODB_STATE_DIR"):
        paths[key] = Path(values[key])
        if not paths[key].is_absolute():
            raise BackupError("config", f"{key} must be an absolute path")
    return Config(uri=uri, container=container, databases=databases,
                  recipients=paths["MONGODB_BACKUP_RECIPIENTS_FILE"], root=paths["MONGODB_BACKUP_ROOT"],
                  bucket=bucket, prefix=prefix, region=region, retention_days=retention_days,
                  state_dir=paths["MONGODB_STATE_DIR"])


def parse_s3_uri(uri: str) -> tuple:
    if not uri.startswith("s3://"):
        raise BackupError("config", "MONGODB_BACKUP_S3_URI must be s3://<bucket>/<prefix>")
    bucket, _, prefix = uri[len("s3://"):].partition("/")
    prefix = prefix.strip("/")
    if not BUCKET.fullmatch(bucket) or not prefix or not PREFIX.fullmatch(prefix) \
            or any(part in (".", "..") for part in prefix.split("/")):
        raise BackupError("config", "MONGODB_BACKUP_S3_URI must be s3://<bucket>/<prefix>")
    return bucket, prefix


def state_dir_hint(path: Path) -> Path:
    try:
        value = parse_env(Path(path).read_text(encoding="utf-8")).get("MONGODB_STATE_DIR", "")
    except (OSError, UnicodeDecodeError, ValueError):
        return DEFAULT_STATE_DIR
    return Path(value) if value and Path(value).is_absolute() else DEFAULT_STATE_DIR


def secret_values(uri: str) -> list:
    values = {uri}
    parts = urllib.parse.urlsplit(uri)
    if parts.password:
        values.update({parts.password, urllib.parse.unquote(parts.password)})
    if "@" in parts.netloc:
        values.add(parts.netloc.rsplit("@", 1)[0])
    return sorted((value for value in values if len(value) >= 4), key=len, reverse=True)


def redact(text: str, secrets) -> str:
    for secret in secrets:
        text = text.replace(secret, "[redacted]")
    return URI_TEXT.sub("[redacted]", text)


def tail(data, secrets) -> str:
    text = data.decode("utf-8", "replace") if isinstance(data, bytes) else data
    lines = [line.strip()[:300] for line in redact(text, secrets).splitlines() if line.strip()]
    return " | ".join(lines[-5:]) or "no error output"


def run_name(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_dump_report(text: str, database: str) -> dict:
    prefix = database + "."
    counts = {}
    for match in DUMP_DONE.finditer(text):
        if match.group(1).startswith(prefix):
            counts[match.group(1)[len(prefix):]] = int(match.group(2))
    return counts


def split_dev_collections(names) -> tuple:
    included = sorted(name for name in names if name.startswith(EVALUATION_PREFIX))
    excluded = sorted(name for name in names if not name.startswith(EVALUATION_PREFIX))
    return included, excluded


def child_environment() -> dict:
    environment = {key: os.environ[key] for key in ("PATH", "HOME", "LANG", "DOCKER_HOST", "DOCKER_CONFIG")
                   if key in os.environ}
    environment.setdefault("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
    environment.setdefault("LANG", "C.UTF-8")
    return environment


def label(args: list) -> str:
    if args[:2] == ["docker", "run"] and "--entrypoint" in args:
        return "docker run " + args[args.index("--entrypoint") + 1]
    return " ".join(Path(part).name if index == 0 else part for index, part in enumerate(args[:2]))


def run_command(args: list, stage: str, secrets, input_bytes: bytes = None, stdout=subprocess.PIPE) -> str:
    try:
        completed = subprocess.run(args, input=input_bytes, stdout=stdout, stderr=subprocess.PIPE,
                                   env=child_environment(), timeout=COMMAND_TIMEOUT, check=False)
    except FileNotFoundError:
        raise BackupError(stage, f"{Path(args[0]).name} command is not installed") from None
    except subprocess.TimeoutExpired:
        raise BackupError(stage, f"{label(args)} timed out") from None
    if completed.returncode != 0:
        raise BackupError(stage, f"{label(args)} exited {completed.returncode}: {tail(completed.stderr, secrets)}")
    return completed.stdout.decode("utf-8", "replace") if completed.stdout is not None else ""


def create_private_file(path: Path):
    return os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb")


def atomic_write(path: Path, content: str, mode: int) -> None:
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    os.fchmod(descriptor, mode)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def log(event: str, **fields) -> None:
    print(json.dumps({"event": event, **fields}, ensure_ascii=False, sort_keys=True), flush=True)


class SecretFiles:
    """컨테이너에 읽기 전용으로 넘길 0700 폴더와 0600 파일. 끝나면 지운다."""

    def __init__(self, config: Config):
        self.config = config
        self.path = None

    def __enter__(self):
        runtime = os.environ.get("RUNTIME_DIRECTORY", "").split(":")[0] or None
        try:
            self.path = Path(tempfile.mkdtemp(prefix="secrets-", dir=runtime))
            os.chmod(self.path, 0o700)
            self.write("uri", self.config.uri + "\n")
            self.write("mongodump.yaml", "uri: " + json.dumps(self.config.uri) + "\n")
            self.write("query.js", QUERY_SCRIPT)
        except OSError as error:
            self.__exit__(None, None, None)
            raise BackupError("prepare", f"cannot prepare secret files: {error.strerror}") from None
        return self

    def __exit__(self, *_):
        if self.path is not None:
            shutil.rmtree(self.path, ignore_errors=True)

    def write(self, name: str, content: str) -> None:
        path = self.path / name
        if path.exists():
            path.unlink()
        with create_private_file(path) as handle:
            handle.write(content.encode("utf-8"))

    def mount(self) -> str:
        return f"{self.path}:{MOUNT}:ro"


class Backup:
    READY_TIMEOUT = 120
    READY_INTERVAL = 5

    def __init__(self, config: Config, clock):
        self.config = config
        self.clock = clock
        self.secrets = config.secrets()
        self.stage = "prepare"

    def helper(self, files: SecretFiles, image_id: str, entrypoint: str, *arguments) -> list:
        return ["docker", "run", "--rm", "--network", f"container:{self.config.container}", "-v", files.mount(),
                "--entrypoint", entrypoint, image_id, *arguments]

    def inspect_once(self) -> dict:
        output = run_command(["docker", "inspect", "--format", INSPECT_TEMPLATE, self.config.container],
                             "inspect", self.secrets)
        try:
            data = json.loads(output)
        except ValueError:
            raise BackupError("inspect", "unexpected docker inspect output") from None
        if not isinstance(data, dict) or not data.get("image") or not data.get("image_id"):
            raise BackupError("inspect", "unexpected docker inspect output")
        return data

    def inspect(self, wait: bool = False) -> tuple:
        """운영 컨테이너의 이미지를 읽는다. wait면 재부팅 직후 따라잡기 실행처럼 healthy가 될 때까지 기다린다."""
        deadline = time.monotonic() + (self.READY_TIMEOUT if wait else 0)
        while True:
            data = self.inspect_once()
            ready = data.get("running") is True and data.get("health") in (None, "healthy")
            if ready or time.monotonic() >= deadline:
                break
            time.sleep(self.READY_INTERVAL)
        if data.get("running") is not True:
            raise BackupError("inspect", "MongoDB container is not running")
        if not ready:
            raise BackupError("inspect", f"MongoDB container is not healthy ({data.get('health')})")
        return data["image"], data["image_id"]

    def tool_versions(self, image_id: str) -> dict:
        dump = run_command(["docker", "run", "--rm", "--entrypoint", "mongodump", image_id, "--version"],
                           "inspect", self.secrets)
        shell = run_command(["docker", "run", "--rm", "--entrypoint", "mongosh", image_id, "--version"],
                            "inspect", self.secrets)
        match = re.search(r"mongodump version: (\S+)", dump)
        return {"mongodump": match.group(1) if match else "unknown",
                "mongosh": shell.strip().splitlines()[0] if shell.strip() else "unknown"}

    def query(self, files: SecretFiles, image_id: str, request: dict) -> dict:
        files.write("request.json", json.dumps(request))
        output = run_command(self.helper(files, image_id, "mongosh", "--nodb", "--quiet", f"{MOUNT}/query.js"),
                             "dump", self.secrets)
        lines = [line for line in output.splitlines() if line.strip()]
        try:
            return json.loads(lines[-1])
        except (IndexError, ValueError):
            raise BackupError("dump", f"unexpected mongosh output for {request['action']}") from None

    def hashes(self, files: SecretFiles, image_id: str, database: str, names) -> dict:
        if not names:
            return {}
        return self.query(files, image_id, {"action": "hash", "database": database,
                                            "collections": sorted(names)})["collections"]

    def encrypt_stream(self, producer: list, output_path: Path, directory: Path) -> str:
        environment = child_environment()
        with create_private_file(output_path) as output, tempfile.TemporaryFile(dir=directory) as dump_errors, \
                tempfile.TemporaryFile(dir=directory) as age_errors:
            try:
                dump = subprocess.Popen(producer, stdout=subprocess.PIPE, stderr=dump_errors, env=environment)
            except FileNotFoundError:
                raise BackupError("dump", "docker command is not installed") from None
            try:
                encrypt = subprocess.Popen(["age", "-R", str(self.config.recipients)], stdin=dump.stdout,
                                           stdout=output, stderr=age_errors, env=environment)
            except FileNotFoundError:
                dump.kill()
                dump.wait()
                raise BackupError("dump", "age command is not installed") from None
            dump.stdout.close()
            try:
                encrypt_code = encrypt.wait(timeout=COMMAND_TIMEOUT)
                dump_code = dump.wait(timeout=COMMAND_TIMEOUT)
            except subprocess.TimeoutExpired:
                for process in (dump, encrypt):
                    process.kill()
                    process.wait()
                raise BackupError("dump", "mongodump or age timed out") from None
            dump_errors.seek(0)
            report = dump_errors.read().decode("utf-8", "replace")
            age_errors.seek(0)
            age_report = age_errors.read()
        if dump_code != 0:
            raise BackupError("dump", f"mongodump exited {dump_code}: {tail(report, self.secrets)}")
        if encrypt_code != 0:
            raise BackupError("dump", f"age exited {encrypt_code}: {tail(age_report, self.secrets)}")
        return report

    def encrypt_bytes(self, data: bytes, output_path: Path, stage: str) -> None:
        with create_private_file(output_path) as output:
            run_command(["age", "-R", str(self.config.recipients)], stage, self.secrets, input_bytes=data,
                        stdout=output)

    def dump_target(self, files: SecretFiles, image_id: str, target: str, database: str, run_dir: Path) -> dict:
        started = self.clock()
        names = self.query(files, image_id, {"action": "collections", "database": database})["names"]
        included, excluded = split_dev_collections(names) if target == "dev" else (sorted(names), [])
        before = self.hashes(files, image_id, database, included)
        checks_before = self.query(files, image_id, {"action": "checks", "database": database}) \
            if target == "prod" else None
        arguments = ["--config", f"{MOUNT}/mongodump.yaml", "--db", database]
        for name in excluded:
            arguments += ["--excludeCollection", name]
        arguments += ["--archive", "--gzip"]
        filename = f"{target}.archive.gz.age"
        report = self.encrypt_stream(self.helper(files, image_id, "mongodump", *arguments),
                                     run_dir / filename, files.path)
        counts = parse_dump_report(report, database)
        if target == "dev":
            stray = sorted(name for name in counts if not name.startswith(EVALUATION_PREFIX))
            if stray:
                raise BackupError("dump", "dev dump contains collections outside evaluation_: " + ", ".join(stray))
        dumped = sorted(set(included) | set(counts))
        after = self.hashes(files, image_id, database, dumped)
        collections = {}
        for name in dumped:
            hash_before, hash_after = before.get(name), after.get(name)
            collections[name] = {
                "documents": counts.get(name, 0),
                "hash_before": hash_before,
                "hash_after": hash_after,
                "changed_during_dump": name not in counts or hash_before is None or hash_before != hash_after,
            }
        archive = run_dir / filename
        entry = {"database": database, "file": filename, "size_bytes": archive.stat().st_size,
                 "sha256": sha256(archive), "duration_seconds": round(self.clock() - started, 3),
                 "collections": collections}
        if target == "dev":
            entry["excluded_collections"] = excluded
        if checks_before is not None:
            checks_after = self.query(files, image_id, {"action": "checks", "database": database})
            entry["checks"] = {**checks_before, "stable": checks_before == checks_after}
        return entry

    def create_run_dir(self, run: str) -> Path:
        root = self.config.root
        if root.is_symlink() or not root.is_dir():
            raise BackupError("prepare", "backup root is missing")
        run_dir = root / run
        try:
            os.mkdir(run_dir, 0o700)
            os.chmod(run_dir, 0o700)
        except FileExistsError:
            raise BackupError("prepare", f"run folder {run} already exists") from None
        except OSError as error:
            raise BackupError("prepare", f"cannot create run folder: {error.strerror}") from None
        return run_dir

    def dump(self, run: str, started: float) -> tuple:
        self.stage = "prepare"
        run_dir = self.create_run_dir(run)
        with SecretFiles(self.config) as files:
            self.stage = "inspect"
            image, image_id = self.inspect(wait=True)
            tools = self.tool_versions(image_id)
            self.stage = "dump"
            targets = {}
            for target, database in self.config.databases.items():
                targets[target] = self.dump_target(files, image_id, target, database, run_dir)
                entry = targets[target]
                log("target_dumped", run=run, target=target, collections=len(entry["collections"]),
                    documents=sum(item["documents"] for item in entry["collections"].values()),
                    size_bytes=entry["size_bytes"], duration_seconds=entry["duration_seconds"])
        self.stage = "manifest"
        manifest = {
            "format": 1,
            "run": run,
            "started_at": iso(started),
            "finished_at": iso(self.clock()),
            "duration_seconds": round(self.clock() - started, 3),
            "image": image,
            "image_id": image_id,
            "tools": tools,
            "remote": f"{self.config.remote}/{run}/",
            "targets": targets,
        }
        data = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
        try:
            with create_private_file(run_dir / "manifest.json") as handle:
                handle.write(data)
        except OSError as error:
            raise BackupError("manifest", f"cannot write manifest: {error.strerror}") from None
        self.encrypt_bytes(data, run_dir / "manifest.json.age", "manifest")
        return run_dir, manifest

    def upload(self, run_dir: Path, run: str) -> list:
        """age 파일만 archive 먼저, manifest 마지막 순서로 올리고 원격 크기를 대조한다. 원격 삭제는 없다."""
        self.stage = "upload"
        archives = sorted(path for path in run_dir.iterdir()
                          if path.name.endswith(".age") and path.name != "manifest.json.age")
        files = archives + [run_dir / "manifest.json.age"]
        for path in files:
            if path.is_symlink() or not path.is_file():
                raise BackupError("upload", f"{path.name} is not a regular file")
            with path.open("rb") as handle:
                if handle.read(len(AGE_HEADER)) != AGE_HEADER:
                    raise BackupError("upload", f"{path.name} is not an age encrypted file")
        uploaded = []
        for path in files:
            key = f"{self.config.prefix}/{run}/{path.name}"
            run_command(["aws", "s3", "cp", str(path), f"s3://{self.config.bucket}/{key}",
                         "--region", self.config.region, "--only-show-errors"], "upload", self.secrets)
            output = run_command(["aws", "s3api", "head-object", "--bucket", self.config.bucket, "--key", key,
                                  "--region", self.config.region, "--output", "json"], "upload", self.secrets)
            try:
                remote_size = json.loads(output)["ContentLength"]
            except (ValueError, KeyError, TypeError):
                raise BackupError("upload", f"unexpected head-object output for {path.name}") from None
            local_size = path.stat().st_size
            if remote_size != local_size:
                raise BackupError("upload", f"{path.name} remote size {remote_size} differs from local {local_size}")
            uploaded.append({"file": path.name, "size_bytes": local_size})
        log("upload_verified", run=run, files=len(uploaded), size_bytes=sum(item["size_bytes"] for item in uploaded))
        return uploaded


def run_time(name: str):
    if not RUN_PATTERN.fullmatch(name):
        return None
    try:
        return datetime.strptime(name, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return None


def expired_runs(root: Path, now: float, retention_days: int, keep) -> list:
    """백업 루트 바로 아래의 시각 형식 실제 폴더 가운데 보관 일수가 지났고 keep에 없는 것."""
    cutoff = now - retention_days * 86400
    resolved_root = root.resolve()
    expired = []
    for path in sorted(root.iterdir()):
        stamp = run_time(path.name)
        if stamp is None or stamp >= cutoff or path.name in keep:
            continue
        if path.is_symlink() or not path.is_dir() or path.resolve().parent != resolved_root:
            continue
        expired.append(path)
    return expired


def prune(root: Path, now: float, retention_days: int, keep) -> list:
    removed = []
    for path in expired_runs(root, now, retention_days, keep):
        shutil.rmtree(path)
        removed.append(path.name)
    return removed


def read_state(state_dir: Path) -> dict:
    try:
        value = json.loads((state_dir / STATE_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def number(value) -> str:
    if isinstance(value, float) and not value.is_integer():
        return f"{value:.3f}".rstrip("0").rstrip(".")
    return str(int(value))


def write_metrics(state_dir: Path, attempt: int, success: bool, duration: float, stage, state: dict) -> None:
    lines = [
        ("career_mongo_backup_last_attempt_timestamp_seconds", attempt),
        ("career_mongo_backup_last_success_timestamp_seconds", state.get("last_success_timestamp", 0)),
        ("career_mongo_backup_success", 1 if success else 0),
        ("career_mongo_backup_duration_seconds", duration),
        ("career_mongo_backup_size_bytes", state.get("size_bytes", 0)),
    ]
    for target, size in sorted(state.get("target_sizes", {}).items()):
        if target in dict(TARGETS):
            lines.append((f'career_mongo_backup_target_size_bytes{{target="{target}"}}', size))
    if not success:
        lines.append((f'career_mongo_backup_failure_stage{{stage="{stage if stage in STAGES else "state"}"}}', 1))
    atomic_write(state_dir / METRICS_FILE, "".join(f"{name} {number(value)}\n" for name, value in lines), 0o644)


def finish(state_dir: Path, state: dict, started: float, clock, error, run, secrets=()) -> int:
    duration = round(clock() - started, 3)
    if error is None:
        log("backup_finished", run=run, result="success", duration_seconds=duration,
            size_bytes=state.get("size_bytes", 0))
    else:
        log("backup_failed", run=run, stage=error.stage, reason=redact(error.reason, secrets),
            duration_seconds=duration)
    try:
        write_metrics(state_dir, int(started), error is None, duration, error.stage if error else None, state)
    except OSError as failure:
        log("metrics_write_failed", reason=failure.strerror)
        return 1
    return 0 if error is None else 1


def backup(env_file: Path, clock) -> int:
    started = clock()
    try:
        config = load_config(env_file)
    except BackupError as error:
        state_dir = state_dir_hint(env_file)
        return finish(state_dir, read_state(state_dir), started, clock, error, None)
    state = read_state(config.state_dir)
    run = run_name(started)
    log("backup_started", run=run)
    job = Backup(config, clock)
    try:
        run_dir, manifest = job.dump(run, started)
        uploaded = job.upload(run_dir, run)
        sizes = {target: entry["size_bytes"] for target, entry in manifest["targets"].items()}
        state = {"last_success_run": run, "last_success_timestamp": int(started),
                 "size_bytes": sum(item["size_bytes"] for item in uploaded), "target_sizes": sizes}
        try:
            atomic_write(config.state_dir / STATE_FILE, json.dumps(state, sort_keys=True) + "\n", 0o600)
        except OSError as error:
            raise BackupError("state", f"cannot write state: {error.strerror}") from None
        try:
            removed = prune(config.root, started, config.retention_days, {run})
        except OSError as error:
            raise BackupError("retention", f"cannot remove expired run folder: {error.strerror}") from None
        if removed:
            log("retention_removed", run=run, removed=removed)
    except BackupError as error:
        return finish(config.state_dir, state, started, clock, error, run, config.secrets())
    except (OSError, KeyError, TypeError, ValueError) as error:
        detail = error.strerror if isinstance(error, OSError) and error.strerror else str(error)
        failure = BackupError(job.stage, f"unexpected {type(error).__name__}: {detail}")
        return finish(config.state_dir, state, started, clock, failure, run, config.secrets())
    return finish(config.state_dir, state, started, clock, None, run)


class Checklist:
    def __init__(self):
        self.passed = True

    def report(self, item: str, passed: bool, reason: str = "") -> bool:
        self.passed = self.passed and passed
        print(f"ok {item}" if passed else f"fail {item}: {reason}", flush=True)
        return passed


def check(env_file: Path) -> int:
    """덤프 없이 설치 상태를 점검한다. 비밀값과 계정 식별자는 출력하지 않는다."""
    checklist = Checklist()
    try:
        mode = Path(env_file).stat().st_mode & 0o777
    except OSError:
        checklist.report("env_file", False, "missing or unreadable")
        return 1
    if not checklist.report("env_file", mode == 0o600, f"mode must be 600, found {mode:o}"):
        return 1
    try:
        config = load_config(env_file)
    except BackupError as error:
        checklist.report("settings", False, error.reason)
        return 1
    checklist.report("settings", True)
    secrets = config.secrets()
    search_path = child_environment()["PATH"]
    commands = {command: shutil.which(command, path=search_path) is not None for command in ("docker", "age", "aws")}
    for command, found in commands.items():
        checklist.report(command, found, "command not found")
    if commands["docker"]:
        try:
            Backup(config, time.time).inspect()
            checklist.report("container", True)
        except BackupError as error:
            checklist.report("container", False, redact(error.reason, secrets))
    else:
        checklist.report("container", False, "docker command not found")
    try:
        lines = config.recipients.read_text(encoding="utf-8").splitlines()
        checklist.report("recipients", any(line.strip().startswith("age1") for line in lines),
                         "no age1 recipient public key")
    except (OSError, UnicodeDecodeError):
        checklist.report("recipients", False, "missing or unreadable")
    root = config.root
    root_ok = root.is_dir() and not root.is_symlink() and root.stat().st_mode & 0o777 == 0o700
    checklist.report("backup_root", root_ok, "must be a real folder with mode 700")
    state_ok = config.state_dir.is_dir() and os.access(config.state_dir, os.W_OK)
    checklist.report("state_dir", state_ok, "must be a writable folder")
    if commands["aws"]:
        try:
            output = run_command(["aws", "sts", "get-caller-identity", "--region", config.region, "--output", "json"],
                                 "check", secrets)
            arn = json.loads(output).get("Arn", "")
            checklist.report("aws_role", bool(BACKUP_ROLE.search(arn)), "credentials are not the ec2-project role")
        except (BackupError, ValueError, AttributeError):
            checklist.report("aws_role", False, "cannot read instance role credentials")
    else:
        checklist.report("aws_role", False, "aws command not found")
    return 0 if checklist.passed else 1


def parse_arguments(argv) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Career Form MongoDB encrypted backup")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--check", action="store_true", help="check the installation without dumping")
    return parser.parse_args(argv)


def main(argv=None, clock=time.time) -> int:
    arguments = parse_arguments(argv)
    if arguments.check:
        return check(arguments.env_file)
    return backup(arguments.env_file, clock)


if __name__ == "__main__":
    sys.exit(main())
