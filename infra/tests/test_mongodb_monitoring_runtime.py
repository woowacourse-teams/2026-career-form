import http.server
import json
import os
import re
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.parse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENT = ROOT / "infra/monitoring/mongodb"
ALLOY = "grafana/alloy:v1.20.1@sha256:2aa2099af76c0098d4af7a4d6e48f86cb66dc1a000222ad927a1c67c6542d13f"
MONGO = os.environ.get("MONGODB_RUNTIME_IMAGE", "mongo:8.0.26-noble@sha256:b49841837cd7688885d7479d14a71733bacae4c99faaae615622384eaee045a0")


@unittest.skipUnless(os.environ.get("RUN_MONGODB_INTEGRATION") == "1", "Explicit isolated synthetic MongoDB/Alloy test")
class MongoDBMonitoringRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory(prefix="cf207-mongo-runtime-")
        cls.addClassCleanup(cls.workspace.cleanup)
        cls.root = Path(cls.workspace.name)
        cls.project = f"cf207-db-runtime-{os.getpid()}"

        class Receiver(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length", 0)))
                self.send_response(204)
                self.end_headers()

            def log_message(self, *arguments):
                pass

        cls.receiver = http.server.ThreadingHTTPServer(("0.0.0.0", 0), Receiver)
        cls.addClassCleanup(cls.receiver.server_close)
        cls.addClassCleanup(cls.receiver.shutdown)
        threading.Thread(target=cls.receiver.serve_forever, daemon=True).start()
        cls._prepare_files()
        cls._prepare_stack()
        cls.compose("up", "-d")
        cls.wait(lambda: cls.mongo("db.adminCommand({ping:1}).ok").returncode == 0, 90)
        cls.mongo("db.getSiblingDB('admin').createUser({user:'synthetic-monitor',pwd:'synthetic-monitor-password',roles:[{role:'clusterMonitor',db:'admin'},{role:'read',db:'local'}]})")
        cls.mongo("db.getSiblingDB('synthetic_prod').sample.insertOne({safe:1}); db.getSiblingDB('synthetic_dev').sample.insertOne({safe:2})")

    @classmethod
    def _prepare_files(cls):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            cls.port = listener.getsockname()[1]
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            cls.loki_port = listener.getsockname()[1]
        secret = cls.root / "secrets"
        secret.mkdir()
        (secret / "mongodb-uri").write_text("mongodb://synthetic-monitor:synthetic-monitor-password@mongodb:27017/admin?directConnection=true")
        (secret / "ingest-password").write_text("synthetic-password")
        state = cls.root / "state"
        state.mkdir()
        (state / "events.log").write_text(json.dumps({"event": "fixture_start", "timestamp": int(time.time())}) + "\n")
        config = (AGENT / "config.alloy").read_text().replace(
            '"http://" + sys.env("MONITORING_PRIVATE_IP") + ":3100/loki/api/v1/push"',
            '"http://loki:3100/loki/api/v1/push"').replace(
            '"http://" + sys.env("MONITORING_PRIVATE_IP") + ":9090/api/v1/write"',
            f'"http://host.docker.internal:{cls.receiver.server_port}/api/v1/write"')
        (cls.root / "config.alloy").write_text(config)
        (cls.root / "loki.yaml").write_text((ROOT / "infra/monitoring/loki.yaml").read_text())

    @classmethod
    def _prepare_stack(cls):
        services = {
            "mongodb": {"image": MONGO, "environment": {"MONGO_INITDB_ROOT_USERNAME": "synthetic",
                "MONGO_INITDB_ROOT_PASSWORD": "synthetic-password"}},
            "loki": {"image": "grafana/loki:3.7.8@sha256:1107dd5274e0ada47e42472b7a7e71f3b2a2fe878878108f3e2f9e51528f0193",
                "ports": [f"127.0.0.1:{cls.loki_port}:3100"], "command": ["-config.file=/config.yaml"],
                "volumes": [f"{cls.root}/loki.yaml:/config.yaml:ro"]},
            "alloy": {"image": ALLOY, "ports": [f"127.0.0.1:{cls.port}:12345"],
                "mem_limit": "192m",
                "command": ["run", "--server.http.listen-addr=0.0.0.0:12345", "--storage.path=/var/lib/alloy", "/config.alloy"],
                "environment": {"HOST_INSTANCE": "career-db", "MONITORING_PRIVATE_IP": "127.0.0.1",
                    "GOMEMLIMIT": "150MiB",
                    "MONGODB_DEV_DATABASE": "synthetic_dev", "MONGODB_STAGING_DATABASE": "synthetic_staging",
                    "MONGODB_PROD_DATABASE": "synthetic_prod"},
                "volumes": [f"{cls.root}/config.alloy:/config.alloy:ro", f"{cls.root / 'secrets'}:/run/secrets:ro",
                    f"{cls.root / 'state'}:/host/state:ro", "alloy-data:/var/lib/alloy", "/var/run/docker.sock:/var/run/docker.sock:ro",
                    "/proc:/host/proc:ro", "/sys:/host/sys:ro", "/:/host/root:ro"]},
        }
        cls.configuration = cls.root / "compose.json"
        cls.configuration.write_text(json.dumps({"services": services, "volumes": {"alloy-data": {}}}))
        cls.addClassCleanup(cls.compose, "down", "--volumes")
        cls.addClassCleanup(cls.save_diagnostics)

    @classmethod
    def compose(cls, *arguments):
        return subprocess.run(["docker", "compose", "-p", cls.project, "-f", str(cls.configuration), *arguments],
                              capture_output=True, text=True, check=True, timeout=120)

    @classmethod
    def save_diagnostics(cls):
        Path("/tmp/cf207-runtime-containers.log").write_text(cls.compose("logs", "--no-color").stdout)
        try:
            Path("/tmp/cf207-host-markers.json").write_text(json.dumps(cls.logs("mongodb-host")))
        except OSError as error:
            Path("/tmp/cf207-host-markers.json").write_text(json.dumps({"collection_error": type(error).__name__}))

    @classmethod
    def mongo(cls, expression):
        return subprocess.run(["docker", "compose", "-p", cls.project, "-f", str(cls.configuration), "exec", "-T",
            "mongodb", "mongosh", "--quiet", "-u", "synthetic", "-p", "synthetic-password", "--authenticationDatabase",
            "admin", "--eval", expression], capture_output=True, text=True, timeout=15)

    @staticmethod
    def wait(condition, seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            try:
                if condition():
                    return
            except (OSError, ValueError):
                pass
            time.sleep(1)
        raise AssertionError("Synthetic runtime condition did not become true")

    @classmethod
    def metrics(cls):
        with urllib.request.urlopen(f"http://127.0.0.1:{cls.port}/api/v0/component/prometheus.exporter.mongodb.db/metrics", timeout=5) as response:
            return response.read().decode()

    @classmethod
    def logs(cls, service="mongodb"):
        query = urllib.parse.urlencode({"query": '{service="' + service + '"}', "limit": 1000,
            "start": str(time.time_ns() - 600_000_000_000), "end": str(time.time_ns())})
        with urllib.request.urlopen(f"http://127.0.0.1:{cls.loki_port}/loki/api/v1/query_range?{query}", timeout=5) as response:
            return json.load(response)["data"]["result"]

    def test_actual_exporter_exposes_connections_cache_operations_and_database_sizes(self):
        self.wait(lambda: "mongodb_ss_connections" in self.metrics(), 90)
        values = self.metrics()
        (self.root / "exporter-metrics.txt").write_text(values)
        Path("/tmp/cf207-exporter-metrics.txt").write_text(values)
        self.assertIn('conn_type="current"', values)
        self.assertIn('conn_type="available"', values)
        self.assertIn("mongodb_ss_wt_cache", values)
        self.assertIn("mongodb_ss_opcounters", values)
        self.assertIn("mongodb_dbstats", values)
        source = json.loads(self.mongo("JSON.stringify(db.serverStatus().connections)").stdout.strip())
        self.assertGreater(source["current"], 0)
        self.assertGreater(source["available"], 0)
        exported = re.search(r'mongodb_ss_connections\{[^\n]*conn_type="current"[^\n]*\} ([0-9.e+]+)', values)
        self.assertIsNotNone(exported)
        available = re.search(r'mongodb_ss_connections\{[^\n]*conn_type="available"[^\n]*\} ([0-9.e+]+)', values)
        self.assertIsNotNone(available)
        self.assertEqual(source["current"] + source["available"], float(exported.group(1)) + float(available.group(1)))
        data_size = re.search(r'mongodb_dbstats_dataSize\{[^\n]*database="synthetic_prod"[^\n]*\} ([0-9.e+]+)', values)
        self.assertIsNotNone(data_size)
        source_size = float(self.mongo("db.getSiblingDB('synthetic_prod').stats().dataSize").stdout.strip())
        self.assertEqual(source_size, float(data_size.group(1)))
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/metrics", timeout=5) as response:
            Path("/tmp/cf207-alloy-metrics.txt").write_text(response.read().decode())
        sampled = subprocess.check_output(["docker", "stats", "--no-stream", "--format", "{{json .}}",
                                          f"{self.project}-alloy-1"], text=True)
        stats = json.loads(sampled)
        Path("/tmp/cf207-db-resource.json").write_text(json.dumps(stats))
        self.assertLess(float(stats["MemPerc"].rstrip("%")), 90)

    def test_mongo_log_allowlist_preserves_diagnostics_and_removes_private_fields(self):
        stamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() - 90))
        event = {"t": {"$date": stamp}, "s": "W", "c": "COMMAND", "id": 51803,
                 "msg": "private-message", "attr": {"ns": "synthetic_prod.sample", "durationMillis": 750,
                    "docsExamined": 1000, "keysExamined": 0, "nreturned": 1, "planSummary": "COLLSCAN private-key",
                    "command": {"find": "private-collection", "$db": "synthetic_prod", "filter": {"value": "private-value"}}}}
        logger = f"{self.project}-logger"
        try:
            subprocess.run(["docker", "run", "-d", "--name", logger, "--label", "com.docker.compose.service=mongodb",
                "-e", "SYNTHETIC_EVENT=" + json.dumps(event),
                "--entrypoint", "sh", MONGO, "-c", "sleep 20; printf '%s\\n' \"$SYNTHETIC_EVENT\"; sleep 120"],
                check=True, capture_output=True, env=os.environ)
            self.wait(lambda: any("eventId=51803" in entry[1]
                for stream in self.logs() for entry in stream.get("values", [])), 90)
            selected = [(stream, entry) for stream in self.logs() for entry in stream.get("values", [])
                        if "eventId=51803" in entry[1]]
            stream, entry = selected[0]
            self.assertEqual("prod", stream["stream"]["env"])
            self.assertIn("command=find", entry[1])
            self.assertIn("durationMs=750", entry[1])
            self.assertIn("docsExamined=1000", entry[1])
            self.assertIn("plan=COLLSCAN", entry[1])
            self.assertNotIn("private", json.dumps(selected))
            self.assertNotIn("synthetic_prod", json.dumps(selected))
            import datetime
            expected = datetime.datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
            self.assertEqual(expected, int(entry[0]) / 1_000_000_000)
        finally:
            subprocess.run(["docker", "rm", "-f", logger], capture_output=True)

    def test_log_markers_resume_after_central_outage_and_agent_restart(self):
        events = self.root / "state/events.log"

        def emit(marker):
            with events.open("a") as output:
                output.write(json.dumps({"event": marker, "timestamp": int(time.time())}) + "\n")

        def observed():
            return [entry[1] for stream in self.logs("mongodb-host") for entry in stream.get("values", [])]

        emit("fixture_before_outage")
        self.wait(lambda: any("fixture_before_outage" in line for line in observed()), 60)
        self.compose("stop", "loki")
        emit("fixture_buffered_outage")
        time.sleep(5)
        self.compose("start", "loki")
        self.wait(lambda: any("fixture_buffered_outage" in line for line in observed()), 60)
        self.compose("stop", "loki")
        emit("fixture_during_restart")
        time.sleep(5)
        self.compose("restart", "alloy")
        emit("fixture_after_agent_restart")
        self.compose("start", "loki")
        self.wait(lambda: all(any(marker in line for line in observed()) for marker in
            ("fixture_before_outage", "fixture_buffered_outage", "fixture_after_agent_restart")), 90)
        lines = observed()
        counts = {marker: sum(marker in line for line in lines) for marker in (
            "fixture_before_outage", "fixture_buffered_outage", "fixture_during_restart", "fixture_after_agent_restart")}
        Path("/tmp/cf207-log-delivery-boundary.json").write_text(json.dumps(counts))
        self.assertIn("fixture_during_restart", events.read_text())
        for marker in ("fixture_before_outage", "fixture_buffered_outage", "fixture_after_agent_restart"):
            self.assertEqual(1, sum(marker in line for line in lines), marker)
