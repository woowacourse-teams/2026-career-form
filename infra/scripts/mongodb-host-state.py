#!/usr/bin/env python3
import argparse
import json
import logging
import logging.handlers
import os
import shutil
import subprocess
import time
from pathlib import Path


def observe(state, restarts, boot, host_oom, previous, now, memory_available=100):
    same_boot = previous.get("boot") == boot
    new_oom = state.get("OOMKilled") is True and not previous.get("oom_flag", False)
    new_host_oom = same_boot and host_oom > previous.get("host_oom_count", host_oom)
    restarted = bool(previous) and (state.get("StartedAt") != previous.get("started")
                                   or restarts > previous.get("restarts", restarts))
    healthy = state.get("Running") is True and state.get("Health", {}).get("Status") == "healthy" and memory_available >= 10
    continuous = same_boot and 0 <= now - previous.get("observed_at", now) <= 45
    healthy_since = previous.get("healthy_since", now) if healthy and continuous and previous.get("healthy", False) and not (new_oom or new_host_oom) else now
    active = new_oom or new_host_oom or previous.get("oom_active", False)
    if healthy and not new_oom and not new_host_oom and now - healthy_since >= 300:
        active = False
    return {
        "running": int(state.get("Running") is True),
        "oom_flag": state.get("OOMKilled") is True,
        "exit_code": int(state.get("ExitCode", 0)),
        "started": state.get("StartedAt", ""),
        "restarts": int(restarts),
        "boot": boot,
        "host_oom_count": int(host_oom),
        "last_oom": now if new_oom else previous.get("last_oom", 0),
        "last_host_oom": now if new_host_oom else previous.get("last_host_oom", 0),
        "last_restart": now if restarted else previous.get("last_restart", 0),
        "healthy_since": healthy_since,
        "healthy": healthy,
        "oom_active": int(active),
        "observed_at": now,
    }


def atomic_write(path, content):
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as target:
        target.write(content)
        target.flush()
        os.fsync(target.fileno())
    temporary.replace(path)


def publish(root, value, now, data_directory):
    usage = shutil.disk_usage(data_directory)
    lines = {
        "host_state_timestamp_seconds": now,
        "host_state_success": 1,
        "container_running": value["running"],
        "container_exit_code": value["exit_code"],
        "container_restarts": value["restarts"],
        "last_oom_timestamp_seconds": value["last_oom"],
        "last_host_oom_timestamp_seconds": value["last_host_oom"],
        "last_restart_timestamp_seconds": value["last_restart"],
        "oom_active": value["oom_active"],
        "data_available_bytes": usage.free,
        "data_size_bytes": usage.total,
    }
    root.mkdir(parents=True, exist_ok=True)
    content = "".join(f"career_mongo_{name} {amount}\n" for name, amount in lines.items())
    atomic_write(root / "state.json", json.dumps(value))
    atomic_write(root / "mongodb.prom", content)


def read_container(container):
    template = '{"state":{{json .State}},"restarts":{{.RestartCount}}}'
    result = subprocess.run(["docker", "inspect", "--format", template, container],
                            check=True, capture_output=True, text=True, timeout=10)
    return json.loads(result.stdout)


def read_host_oom(proc):
    values = dict(line.split() for line in (proc / "vmstat").read_text().splitlines())
    return int(values["oom_kill"])


def read_available_memory(proc):
    values = {line.split(':')[0]: int(line.split()[1]) for line in (proc / "meminfo").read_text().splitlines()}
    return 100 * values["MemAvailable"] / values["MemTotal"]


def configure_events(root):
    logger = logging.getLogger("mongodb-host-state")
    logger.setLevel(logging.INFO)
    handler = logging.handlers.RotatingFileHandler(root / "events.log", maxBytes=5_000_000, backupCount=2)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    return logger


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--proc", type=Path, default=Path("/proc"))
    arguments = parser.parse_args()
    root = arguments.output_dir
    root.mkdir(parents=True, exist_ok=True)
    logger = configure_events(root)
    now = int(time.time())
    try:
        previous = json.loads((root / "state.json").read_text()) if (root / "state.json").exists() else {}
        inspected = read_container(arguments.container)
        boot = (arguments.proc / "sys/kernel/random/boot_id").read_text().strip()
        value = observe(inspected["state"], inspected["restarts"], boot, read_host_oom(arguments.proc), previous, now,
                        memory_available=read_available_memory(arguments.proc))
        publish(root, value, now, arguments.data_dir)
        for event in ("last_oom", "last_host_oom", "last_restart"):
            if value[event] == now and previous.get(event) != now:
                logger.info(json.dumps({"timestamp": now, "event": event, "running": value["running"],
                                        "exit_code": value["exit_code"]}))
        return 0
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        atomic_write(root / "mongodb.prom", f"career_mongo_host_state_success 0\ncareer_mongo_host_state_attempt_timestamp_seconds {now}\n")
        logger.error(json.dumps({"timestamp": now, "event": "state_collection_failed"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
