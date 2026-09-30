import base64
import http.server
import json
import os
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MONITORING = ROOT / "infra/monitoring"


class MonitoringFixture:
    @classmethod
    def setUpClass(cls) -> None:
        cls.workspace = tempfile.TemporaryDirectory(prefix="cf-131-runtime-")
        cls.root = Path(cls.workspace.name)
        cls.project = f"cf-131-runtime-{os.getpid()}"
        cls.configuration = cls.root / "compose.json"
        cls.password = "synthetic-integration-password"
        cls.environment = {
            **os.environ,
            "MONITORING_PRIVATE_IP": "127.0.0.1",
            "MONITORING_DATA_DIR": str(cls.root / "data"),
            "MONITORING_SECRETS_DIR": str(cls.root / "secrets"),
        }
        cls._start_receiver()
        cls._prepare_secrets()
        config = cls._central_config()
        cls._host_metrics(config)
        cls._synthetic_backends(config)
        cls._agent(config)
        cls._start_stack(config)

    @classmethod
    def _start_receiver(cls) -> None:
        cls.notifications = []

        class Receiver(http.server.BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                cls.notifications.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(204)
                self.end_headers()

            def log_message(self, format: str, *args) -> None:
                pass

        cls.receiver = http.server.ThreadingHTTPServer(("0.0.0.0", 0), Receiver)
        cls.addClassCleanup(cls.receiver.server_close)
        cls.addClassCleanup(cls.receiver.shutdown)
        threading.Thread(target=cls.receiver.serve_forever, daemon=True).start()

    @classmethod
    def _prepare_secrets(cls) -> None:
        secrets = cls.root / "secrets"
        secrets.mkdir()
        (secrets / "grafana.env").write_text(
            f"DISCORD_WEBHOOK_URL=http://host.docker.internal:{cls.receiver.server_port}/synthetic-webhook\n",
            encoding="utf-8",
        )
        (secrets / "grafana-password").write_text(cls.password, encoding="utf-8")
        hashed = subprocess.check_output(
            ("openssl", "passwd", "-apr1", cls.password), text=True,
        ).strip()
        (secrets / "ingest.htpasswd").write_text(f"synthetic:{hashed}\nalloy:{hashed}\n", encoding="utf-8")

    @classmethod
    def _central_config(cls) -> dict:
        rendered = subprocess.run(
            ("docker", "compose", "-p", cls.project, "-f", str(MONITORING / "compose.yaml"),
             "config", "--format", "json"), env=cls.environment,
            capture_output=True, text=True, check=False,
        )
        if rendered.returncode != 0:
            cls.workspace.cleanup()
            raise AssertionError(rendered.stderr)
        config = json.loads(rendered.stdout)
        config["services"]["grafana"]["extra_hosts"] = ["host.docker.internal:host-gateway"]
        cls.allowlist = cls.root / "ingest-allow.conf"
        cls.allowlist.write_text("allow all;\n", encoding="utf-8")
        next(entry for entry in config["services"]["ingest"]["volumes"]
             if entry["target"] == "/etc/nginx/ingest-allow.conf")["source"] = str(cls.allowlist)
        cls.ports = {name: cls._port() for name in ("grafana", "loki", "prometheus")}
        config["services"]["grafana"]["ports"][0]["published"] = str(cls.ports["grafana"])
        for port, name in zip(config["services"]["ingest"]["ports"], ("loki", "prometheus")):
            port["published"] = str(cls.ports[name])
        return config

    @classmethod
    def _host_metrics(cls, config: dict) -> None:
        for name in ("loki", "prometheus", "grafana", "host-metrics"):
            data = cls.root / "data" / name
            data.mkdir(parents=True)
            data.chmod(0o777)
        alloy = cls.root / "monitoring.alloy"
        alloy.write_text(
            (MONITORING / "alloy/monitoring.alloy").read_text(encoding="utf-8")
            .replace("/host/proc", "/proc").replace("/host/sys", "/sys")
            .replace("/host/root", "/"), encoding="utf-8",
        )
        host = config["services"]["host-metrics"]
        host["volumes"] = [entry for entry in host["volumes"]
                           if entry["target"] not in ("/host/proc", "/host/sys", "/host/root")]
        next(entry for entry in host["volumes"] if entry["target"] == "/etc/alloy/config.alloy")["source"] = str(alloy)
        config["services"]["prometheus"]["ports"] = [
            {"target": 9090, "published": str(cls._port()), "host_ip": "127.0.0.1"}
        ]
        cls.prometheus_query_port = int(config["services"]["prometheus"]["ports"][0]["published"])

    @classmethod
    def _synthetic_backends(cls, config: dict) -> None:
        cls.agent_marker = f"synthetic-agent-{cls.project}"
        for env in ("dev", "staging", "prod"):
            fixture = cls.root / f"nginx-{env}.conf"
            fixture.write_text(
                'events {}\nhttp { log_format synthetic "' + cls.agent_marker + '-' + env + ' $request_uri"; '
                'access_log /dev/stdout synthetic; server { listen 9091; '
                'location /actuator/prometheus { return 200 "synthetic_backend_ready 1\\n"; } } }\n',
                encoding="utf-8",
            )
            config["services"][f"synthetic-{env}"] = {
                "image": config["services"]["ingest"]["image"], "platform": "linux/arm64",
                "command": ["nginx", "-g", "daemon off;"], "entrypoint": [],
                "expose": ["9091"],
                "labels": {"career-form.monitoring": "true", "career-form.env": env,
                           "career-form.service": "career-form-backend", "career-form.synthetic-test": cls.project},
                "volumes": [{"type": "bind", "source": str(fixture),
                             "target": "/etc/nginx/nginx.conf", "read_only": True}],
            }

    @classmethod
    def _agent(cls, config: dict) -> None:
        secrets = cls.root / "secrets"
        agent = cls.root / "agent.alloy"
        agent.write_text(
            (MONITORING / "alloy/config.alloy").read_text(encoding="utf-8")
            .replace('["career-form.monitoring=true"]',
                     '["career-form.monitoring=true", "career-form.synthetic-test=' + cls.project + '"]')
            .replace('"http://" + sys.env("MONITORING_PRIVATE_IP")', '"http://ingest"')
            .replace("/host/proc", "/proc").replace("/host/sys", "/sys")
            .replace("/host/root", "/"), encoding="utf-8",
        )
        agent_data = cls.root / "data/agent"
        agent_data.mkdir()
        config["services"]["agent"] = {
            "image": config["services"]["host-metrics"]["image"], "platform": "linux/arm64",
            "environment": {"HOST_INSTANCE": "synthetic-host"},
            "command": ["run", "--storage.path=/var/lib/alloy", "/etc/alloy/config.alloy"],
            "volumes": [
                {"type": "bind", "source": str(agent), "target": "/etc/alloy/config.alloy", "read_only": True},
                {"type": "bind", "source": str(agent_data), "target": "/var/lib/alloy"},
                {"type": "bind", "source": "/var/run/docker.sock", "target": "/var/run/docker.sock", "read_only": True},
                {"type": "bind", "source": str(secrets / "grafana-password"),
                 "target": "/run/secrets/ingest-password", "read_only": True},
            ],
        }

    @classmethod
    def _start_stack(cls, config: dict) -> None:
        cls.configuration.write_text(json.dumps(config), encoding="utf-8")
        cls.addClassCleanup(cls._cleanup)
        started = cls._compose("up", "-d", "--wait", "--wait-timeout", "60")
        if started.returncode != 0:
            raise AssertionError(started.stderr + cls._compose("logs", "--tail", "30", "agent").stdout)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                if cls._get("/api/health")["database"] == "ok":
                    return
            except (OSError, ValueError):
                pass
            time.sleep(0.5)
        raise AssertionError(cls._compose("logs", "--tail", "50").stdout)

    @classmethod
    def _get(cls, path: str):
        return cls._request(path, "GET")

    @classmethod
    def _request(cls, path: str, method: str, payload=None):
        token = base64.b64encode(f"admin:{cls.password}".encode()).decode()
        request = urllib.request.Request(
            f"http://127.0.0.1:{cls.ports['grafana']}{path}",
            data=None if payload is None else json.dumps(payload).encode(), method=method,
            headers={"Authorization": f"Basic {token}", "Content-Type": "application/json",
                     "X-Disable-Provenance": "true"},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    @classmethod
    def _compose(cls, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ("docker", "compose", "-p", cls.project, "-f", str(cls.configuration), *arguments),
            env=cls.environment, capture_output=True, text=True, check=False,
        )

    @classmethod
    def _cleanup(cls) -> None:
        cls._compose("down", "--timeout", "5")
        cls.workspace.cleanup()

    @staticmethod
    def _port() -> int:
        with socket.socket() as connection:
            connection.bind(("127.0.0.1", 0))
            return connection.getsockname()[1]
