import http.server
import json
import os
import shutil
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

from infra.tests.monitoring_runtime_fixture import MONITORING, MonitoringFixture


HOSTS = ("career-dev-staging", "career-prod")


class DiskAlertFixture(MonitoringFixture):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workspace = tempfile.TemporaryDirectory(prefix="cf144-disk-runtime-")
        cls.addClassCleanup(cls.workspace.cleanup)
        cls.root = Path(cls.workspace.name)
        cls.project = f"cf144-disk-runtime-{os.getpid()}"
        cls.configuration = cls.root / "compose.json"
        cls.password = "synthetic-disk-test-password"
        cls.environment = {**os.environ, "MONITORING_PRIVATE_IP": "127.0.0.1",
            "MONITORING_DATA_DIR": str(cls.root / "data"),
            "MONITORING_SECRETS_DIR": str(cls.root / "secrets")}
        cls.available = dict.fromkeys(HOSTS, 11)
        cls.failures = {}
        cls._start_receiver()
        cls._prepare_secrets()
        config = cls._central_config()
        selected = {name: config["services"][name] for name in ("grafana", "prometheus")}
        for name in selected:
            data = cls.root / "data" / name
            data.mkdir(parents=True)
            data.chmod(0o777)
        cls.prometheus_query_port = cls._port()
        prometheus = {**selected["prometheus"],
            "ports": [{"target": 9090, "published": str(cls.prometheus_query_port), "host_ip": "127.0.0.1"}],
            "extra_hosts": ["host.docker.internal:host-gateway"],
            "command": [*selected["prometheus"]["command"], "--query.lookback-delta=2s"]}
        prometheus = cls._configure_prometheus(prometheus)
        grafana = cls._configure_grafana(selected["grafana"])
        cls._start_stack({**config, "services": {"grafana": grafana, "prometheus": prometheus}})

    @classmethod
    def _configure_prometheus(cls, service: dict) -> dict:
        target = cls.root / "prometheus.yaml"
        target.write_text(yaml.safe_dump({"global": {"scrape_interval": "1s"}, "scrape_configs": [{
            "job_name": "host", "honor_labels": True,
            "static_configs": [{"targets": [f"host.docker.internal:{cls.receiver.server_port}"]}],
        }]}), encoding="utf-8")
        return {**service, "volumes": [
            {**entry, "source": str(target)} if entry["target"] == "/etc/prometheus/prometheus.yaml"
            else entry for entry in service["volumes"]]}

    @classmethod
    def _configure_grafana(cls, service: dict) -> dict:
        provisioning = cls.root / "provisioning"
        shutil.copytree(MONITORING / "grafana/provisioning", provisioning)
        for path in (provisioning / "alerting").glob("rules*.json"):
            if path.name != "rules-hosts.json":
                path.unlink()
        sources = provisioning / "datasources/datasources.yaml"
        parsed = yaml.safe_load(sources.read_text(encoding="utf-8"))
        configured = {**parsed, "datasources": [
            {**entry, "url": f"http://host.docker.internal:{cls.receiver.server_port}"}
            for entry in parsed["datasources"] if entry["uid"] == "prometheus"]}
        sources.write_text(yaml.safe_dump(configured), encoding="utf-8")
        return {**service, "volumes": [
            {**entry, "source": str(provisioning)} if entry["target"] == "/etc/grafana/provisioning"
            else entry for entry in service["volumes"]]}

    @classmethod
    def _start_receiver(cls) -> None:
        cls.notifications = []

        class Receiver(http.server.BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                body = self.rfile.read(int(self.headers["Content-Length"]))
                if self.path == "/synthetic-webhook":
                    cls.notifications.append((time.monotonic(), json.loads(body)))
                    self._respond(204, b"")
                    return
                query = urllib.parse.parse_qs(body.decode()).get("query", [""])[0]
                self._proxy(query, body)

            def do_GET(self) -> None:
                if self.path == "/metrics":
                    self._respond(200, cls._metrics().encode(), "text/plain")
                    return
                query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("query", [""])[0]
                self._proxy(query)

            def _proxy(self, query: str, body: bytes | None = None) -> None:
                if any(host in query and mode == "error" for host, mode in cls.failures.items()):
                    self._respond(500, b'{"status":"error","errorType":"internal","error":"synthetic query failure"}')
                    return
                try:
                    request = urllib.request.Request(f"http://127.0.0.1:{cls.prometheus_query_port}{self.path}",
                        data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
                    with urllib.request.urlopen(request, timeout=5) as response:
                        self._respond(response.status, response.read())
                except urllib.error.HTTPError as error:
                    self._respond(error.code, error.read())
                    error.close()
                except OSError:
                    self._respond(503, b'{"status":"error","error":"synthetic upstream unavailable"}')

            def _respond(self, code: int, body: bytes, content_type: str = "application/json") -> None:
                self.send_response(code)
                self.send_header("Content-Type", content_type)
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format: str, *args) -> None:
                pass

        cls.receiver = http.server.ThreadingHTTPServer(("0.0.0.0", 0), Receiver)
        cls.addClassCleanup(cls.receiver.server_close)
        cls.addClassCleanup(cls.receiver.shutdown)
        threading.Thread(target=cls.receiver.serve_forever, daemon=True).start()

    @classmethod
    def _metrics(cls) -> str:
        measurements = []
        for host, available in cls.available.items():
            if cls.failures.get(host) == "missing":
                continue
            for mountpoint, value in (("/", available), ("/data", 1)):
                labels = f'instance="{host}",mountpoint="{mountpoint}"'
                measurements.extend([f"node_filesystem_size_bytes{{{labels}}} 100",
                                     f"node_filesystem_avail_bytes{{{labels}}} {value}"])
        return "\n".join(measurements) + "\n"
