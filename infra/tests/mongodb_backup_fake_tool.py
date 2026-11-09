"""MongoDB 백업·복구 스크립트 시험용 가짜 docker, age, aws.

첫 인자는 상태 폴더, 둘째 인자는 흉내 낼 도구 이름이다. 상태 폴더의 scenario.json을 읽어
응답하고 모든 호출을 calls.jsonl에 남긴다. 실제 MongoDB, 암호화, AWS에는 닿지 않는다.
"""
import base64
import json
import os
import shutil
import sys
from pathlib import Path


HEADER = b"age-encryption.org/v1\n-> X25519 synthetic\n--- synthetic\n"
MOUNT = "/run/cf-backup"


def main() -> int:
    home = Path(sys.argv[1])
    tool = sys.argv[2]
    args = sys.argv[3:]
    scenario = json.loads((home / "scenario.json").read_text())
    record(home, tool, args)
    handlers = {"docker": docker, "age": age, "aws": aws}
    return handlers[tool](home, scenario, args)


def record(home: Path, tool: str, args: list) -> None:
    entry = {"tool": tool, "args": args, "env": dict(os.environ)}
    mount = mounted_dir(args)
    if mount is not None and mount.exists():
        entry["mount_modes"] = {path.name: path.stat().st_mode & 0o777 for path in mount.iterdir()}
        entry["mount_modes"]["."] = mount.stat().st_mode & 0o777
    with (home / "calls.jsonl").open("a") as log:
        log.write(json.dumps(entry) + "\n")


def mounted_dir(args: list):
    for index, value in enumerate(args[:-1]):
        if value == "-v" and args[index + 1].split(":")[1:2] == [MOUNT]:
            return Path(args[index + 1].split(":")[0])
    return None


def bump(home: Path, key: str) -> int:
    path = home / "counters.json"
    counters = json.loads(path.read_text()) if path.exists() else {}
    counters[key] = counters.get(key, 0) + 1
    path.write_text(json.dumps(counters))
    return counters[key]


def failing(scenario: dict, name: str) -> bool:
    return bool(scenario.get("fail", {}).get(name))


def docker(home: Path, scenario: dict, args: list) -> int:
    if args[0] == "container":
        args = args[1:]
    command = args[0]
    if command == "inspect":
        return inspect(home, scenario, args)
    if command == "run":
        return run(home, scenario, args)
    if command == "exec":
        return execute(home, scenario, args)
    if command in ("stop", "rm"):
        return remove(home, scenario, args)
    if command == "ps":
        return listing(home, scenario, args)
    sys.stderr.write(f"fake docker: unsupported command {command}\n")
    return 2


def containers(home: Path, scenario: dict) -> dict:
    path = home / "containers.json"
    current = dict(scenario.get("containers", {}))
    if path.exists():
        current.update(json.loads(path.read_text()))
    return {name: value for name, value in current.items() if value is not None}


def save_container(home: Path, name: str, value) -> None:
    path = home / "containers.json"
    current = json.loads(path.read_text()) if path.exists() else {}
    current[name] = value
    path.write_text(json.dumps(current))


def inspect(home: Path, scenario: dict, args: list) -> int:
    name = args[-1]
    template = args[args.index("--format") + 1] if "--format" in args else ""
    container = containers(home, scenario).get(name)
    if container is None or failing(scenario, "inspect"):
        sys.stderr.write(f"Error: No such object: {name}\n")
        return 1
    if "Labels" in template:
        print(json.dumps(container.get("labels", {})))
        return 0
    health = container.get("health", "healthy")
    sequence = container.get("health_sequence")
    if sequence:
        health = sequence[min(bump(home, f"health:{name}"), len(sequence)) - 1]
    print(json.dumps({"image": container["image"], "image_id": container["image_id"],
                      "running": container.get("running", True), "health": health}))
    return 0


def run(home: Path, scenario: dict, args: list) -> int:
    entry = args[args.index("--entrypoint") + 1] if "--entrypoint" in args else None
    if "--version" in args:
        versions = scenario["versions"]
        if entry == "mongodump":
            print(f"mongodump version: {versions['mongodump']}\ngit version: synthetic")
        else:
            print(versions["mongosh"])
        return 0
    if entry == "mongosh":
        return backup_query(home, scenario, args)
    if entry == "mongodump":
        return mongodump(scenario, args)
    if "-d" in args:
        return start_temporary(home, scenario, args)
    sys.stderr.write("fake docker: unsupported run\n")
    return 2


def backup_query(home: Path, scenario: dict, args: list) -> int:
    mount = mounted_dir(args)
    request = json.loads((mount / "request.json").read_text())
    if (mount / "uri").read_text().strip() != scenario["uri"]:
        sys.stderr.write("MongoServerError: Authentication failed.\n")
        return 1
    database = scenario["databases"][request["database"]]
    action = request["action"]
    key = f"{action}:{request['database']}"
    if action == "collections":
        hidden = set(database.get("hidden_from_listing", []))
        result = {"names": sorted(name for name in database["collections"] if name not in hidden)}
    elif action == "hash":
        hashes = database["hashes"] if bump(home, key) == 1 else database.get("hashes_after", database["hashes"])
        result = {"collections": {name: hashes[name] for name in request["collections"] if name in hashes}}
    elif action == "checks":
        result = database["checks"] if bump(home, key) == 1 else database.get("checks_after", database["checks"])
    else:
        sys.stderr.write(f"fake mongosh: unknown action {action}\n")
        return 2
    print(json.dumps(result))
    return 0


def option_values(args: list, name: str) -> list:
    values = []
    for index, value in enumerate(args):
        if value == name and index + 1 < len(args):
            values.append(args[index + 1])
        elif value.startswith(name + "="):
            values.append(value.split("=", 1)[1])
    return values


def mongodump(scenario: dict, args: list) -> int:
    mount = mounted_dir(args)
    config = (mount / "mongodump.yaml").read_text()
    uri = json.loads(config.split(":", 1)[1].strip())
    name = option_values(args, "--db")[0]
    excluded = set(option_values(args, "--excludeCollection"))
    database = scenario["databases"][name]
    included = {collection: count for collection, count in database["collections"].items()
                if collection not in excluded}
    for collection, count in sorted(included.items()):
        noun = "document" if count == 1 else "documents"
        sys.stderr.write(f"2026-11-09T19:00:00.000+0000\twriting `{name}.{collection}` to `archive on stdout`\n")
        sys.stderr.write(f"2026-11-09T19:00:00.000+0000\tdone dumping `{name}.{collection}` ({count} {noun})\n")
    if scenario.get("leak"):
        sys.stderr.write(f"error connecting to host: {uri}\n")
    if failing(scenario, "mongodump"):
        sys.stderr.write(f"Failed: {uri} synthetic dump failure\n")
        return 1
    payload = {"database": name, "collections": included,
               "hashes": {key: database["hashes"][key] for key in included if key in database["hashes"]}}
    sys.stdout.buffer.write(b"FAKE-ARCHIVE " + json.dumps(payload).encode())
    sys.stdout.buffer.flush()
    return 0


def start_temporary(home: Path, scenario: dict, args: list) -> int:
    name = option_values(args, "--name")[0]
    if name in containers(home, scenario):
        sys.stderr.write(f"Error: Conflict. The container name \"/{name}\" is already in use.\n")
        return 125
    labels = dict(value.split("=", 1) for value in option_values(args, "--label"))
    save_container(home, name, {"image": args[-1], "image_id": "sha256:temporary", "running": True,
                                "labels": labels, "restored": {}})
    print(f"{name}-id")
    return 0


def execute(home: Path, scenario: dict, args: list) -> int:
    index = 1
    while args[index].startswith("-"):
        index += 1
    name = args[index]
    command = args[index + 1:]
    container = containers(home, scenario).get(name)
    if container is None:
        sys.stderr.write(f"Error: No such container: {name}\n")
        return 1
    if command[0] == "mongorestore":
        data = sys.stdin.buffer.read()
        if not data.startswith(b"FAKE-ARCHIVE "):
            sys.stderr.write("Failed: archive header is invalid\n")
            return 1
        payload = json.loads(data[len(b"FAKE-ARCHIVE "):])
        restored = container.setdefault("restored", {})
        override = scenario.get("restored_override", {}).get(payload["database"], {})
        restored[payload["database"]] = {
            "collections": {**payload["collections"], **override.get("collections", {})},
            "hashes": {**payload["hashes"], **override.get("hashes", {})},
            "checks": override.get("checks", scenario["databases"].get(payload["database"], {}).get("checks")),
        }
        save_container(home, name, container)
        sys.stderr.write(f"{sum(payload['collections'].values())} document(s) restored successfully. "
                         "0 document(s) failed to restore.\n")
        return 0
    if command[0] == "mongosh":
        script = command[command.index("--eval") + 1]
        if "ping" in script:
            print("1")
            return 0
        request = json.loads(script.split("/*request*/", 2)[1])
        database = container.get("restored", {}).get(request["database"], {"collections": {}, "hashes": {}})
        if request["action"] == "collections":
            print(json.dumps({"counts": database["collections"]}))
        elif request["action"] == "hash":
            print(json.dumps({"collections": {key: database["hashes"][key] for key in request["collections"]
                                              if key in database["hashes"]}}))
        else:
            print(json.dumps(database.get("checks")))
        return 0
    sys.stderr.write("fake docker exec: unsupported command\n")
    return 2


def remove(home: Path, scenario: dict, args: list) -> int:
    name = args[-1]
    container = containers(home, scenario).get(name)
    if container is None:
        sys.stderr.write(f"Error: No such container: {name}\n")
        return 1
    if args[0] == "stop":
        container["running"] = False
        save_container(home, name, container)
    else:
        save_container(home, name, None)
    print(name)
    return 0


def listing(home: Path, scenario: dict, args: list) -> int:
    wanted = [value.split("=", 1)[1] for value in option_values(args, "--filter") if value.startswith("name=")]
    for name in containers(home, scenario):
        if not wanted or any(name == value.strip("^$") for value in wanted):
            print(name)
    return 0


def age(home: Path, scenario: dict, args: list) -> int:
    if failing(scenario, "age"):
        sys.stderr.write("age: error: synthetic failure\n")
        return 1
    output = option_values(args, "-o")
    if "-d" in args or "--decrypt" in args:
        identity = Path(option_values(args, "-i")[0])
        if "AGE-SECRET-KEY-" not in identity.read_text():
            sys.stderr.write("age: error: no identity matched any of the recipients\n")
            return 1
        positional = [value for value in args if not value.startswith("-") and value not in option_values(args, "-i")
                      and value not in output]
        data = Path(positional[-1]).read_bytes() if positional else sys.stdin.buffer.read()
        if not data.startswith(HEADER):
            sys.stderr.write("age: error: failed to read header\n")
            return 1
        try:
            plain = base64.b64decode(data[len(HEADER):], validate=True)
        except ValueError:
            sys.stderr.write("age: error: failed to decrypt payload\n")
            return 1
        write(output, plain)
        return 0
    recipients = Path(option_values(args, "-R")[0])
    if "age1" not in recipients.read_text():
        sys.stderr.write("age: error: no recipients\n")
        return 1
    write(output, HEADER + base64.b64encode(sys.stdin.buffer.read()))
    return 0


def write(output: list, data: bytes) -> None:
    if output:
        Path(output[0]).write_bytes(data)
    else:
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()


def bucket_path(home: Path, uri: str) -> Path:
    return home / "bucket" / uri[len("s3://"):]


def aws(home: Path, scenario: dict, args: list) -> int:
    if args[:2] == ["sts", "get-caller-identity"]:
        if failing(scenario, "sts"):
            sys.stderr.write("Unable to locate credentials.\n")
            return 255
        print(json.dumps({"Arn": scenario.get("arn", "arn:aws:sts::000000000000:assumed-role/ec2-project/i-0")}))
        return 0
    if args[:2] == ["s3", "cp"]:
        if failing(scenario, "aws_cp"):
            sys.stderr.write("upload failed: synthetic AccessDenied\n")
            return 1
        source, target = args[2], args[3]
        if source.startswith("s3://") and "--recursive" in args:
            origin = bucket_path(home, source)
            if not origin.is_dir():
                sys.stderr.write("fatal error: An error occurred (404) when calling the ListObjectsV2 operation\n")
                return 1
            shutil.copytree(origin, target, dirs_exist_ok=True)
            return 0
        if target.startswith("s3://"):
            destination = bucket_path(home, target)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            return 0
        shutil.copyfile(bucket_path(home, source), target)
        return 0
    if args[:2] == ["s3api", "head-object"]:
        bucket = option_values(args, "--bucket")[0]
        key = option_values(args, "--key")[0]
        path = bucket_path(home, f"s3://{bucket}/{key}")
        if not path.exists():
            sys.stderr.write("An error occurred (404) when calling the HeadObject operation: Not Found\n")
            return 254
        delta = scenario.get("head_size_delta", 0)
        print(json.dumps({"ContentLength": path.stat().st_size + delta, "VersionId": "synthetic"}))
        return 0
    sys.stderr.write(f"fake aws: unsupported command {' '.join(args[:2])}\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
