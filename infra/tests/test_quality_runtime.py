import http.client
import http.server
import json
import os
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PASSWORD_HASH = "pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk="


@unittest.skipUnless(os.environ.get("RUN_QUALITY_INTEGRATION") == "1", "Isolated quality backend and synthetic MongoDB")
class QualityRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory(prefix="cf164-quality-runtime-")
        cls.addClassCleanup(cls.workspace.cleanup)
        cls.root = Path(cls.workspace.name)
        cls.container = "cf164-quality-runtime-" + uuid.uuid4().hex[:12]
        subprocess.run(("docker", "run", "--rm", "-d", "--name", cls.container, "-p", "127.0.0.1::27017",
                        "mongo:8.0-noble", "--bind_ip_all", "--quiet"), check=True, capture_output=True)
        cls.addClassCleanup(lambda: subprocess.run(("docker", "stop", cls.container), capture_output=True, check=False))
        port = subprocess.check_output(("docker", "port", cls.container, "27017/tcp"), text=True).strip().rsplit(":", 1)[1]
        cls.backend_port = cls._port()
        subprocess.run((str(ROOT / "backend/gradlew"), "bootJar"), cwd=ROOT / "backend", check=True, capture_output=True)
        jar = next(path for path in (ROOT / "backend/build/libs").glob("*.jar") if not path.name.endswith("-plain.jar"))
        cls.log = (cls.root / "backend.log").open("w+")
        cls.addClassCleanup(cls.log.close)
        environment = dict(os.environ)
        environment.update({"SPRING_MONGODB_URI": f"mongodb://127.0.0.1:{port}/cf164_runtime",
            "CAREER_FORM_ANALYSIS_ENABLED": "false", "CAREER_FORM_LLM_ENABLED": "false",
            "CAREER_FORM_LANGSMITH_ENABLED": "false", "OPENAI_API_KEY": "", "TYPESAFE_API_KEY": ""})
        cls.backend = subprocess.Popen(("java", "-jar", str(jar), "--server.address=127.0.0.1",
            f"--server.port={cls.backend_port}", "--management.server.port=0", "--server.forward-headers-strategy=framework",
            "--career-form.quality.enabled=true", "--career-form.quality.password-hash=" + PASSWORD_HASH,
            "--career-form.quality.query-token-hash=618def57c8f930dd7dc165c96665f0caceffdbb24b8e114265d00ba2000a3957",
            "--career-form.quality.version=synthetic", "--management.metrics.tags.env=quality-test"),
            cwd=ROOT, env=environment, stdout=cls.log, stderr=subprocess.STDOUT)
        cls.addClassCleanup(cls._stop_backend)
        cls._wait_ready()
        cls._start_proxy()
        cls.context = ssl._create_unverified_context()
        cls._seed_candidate()

    @classmethod
    def _stop_backend(cls):
        cls.backend.terminate()
        try:
            cls.backend.wait(timeout=20)
        except subprocess.TimeoutExpired:
            cls.backend.kill()
            cls.backend.wait(timeout=10)

    @staticmethod
    def _port():
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            return listener.getsockname()[1]

    @classmethod
    def _wait_ready(cls):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if cls.backend.poll() is not None:
                raise AssertionError("Synthetic quality backend did not start")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{cls.backend_port}/actuator/health", timeout=3) as response:
                    if response.status == 200:
                        return
            except OSError:
                threading.Event().wait(0.2)
        raise AssertionError("Synthetic quality backend readiness deadline exceeded")

    @classmethod
    def _start_proxy(cls):
        certificate = cls.root / "test-certificate.cert"
        private = cls.root / "test-private.fixture"
        subprocess.run(("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(private),
            "-out", str(certificate), "-days", "1", "-subj", "/CN=localhost"), check=True, capture_output=True)

        class Proxy(http.server.BaseHTTPRequestHandler):
            def route(self):
                upstream = http.client.HTTPConnection("127.0.0.1", cls.backend_port, timeout=15)
                try:
                    payload = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                    headers = {name: value for name, value in self.headers.items()
                        if not name.lower().startswith("x-forwarded-") and name.lower() not in {"forwarded", "connection", "host"}}
                    headers.update({"Host": f"127.0.0.1:{cls.backend_port}", "X-Forwarded-Proto": "https",
                        "X-Forwarded-Host": f"127.0.0.1:{cls.proxy.server_port}"})
                    upstream.request(self.command, self.path, payload or None, headers)
                    received = upstream.getresponse()
                    body = received.read()
                    self.send_response(received.status)
                    for name, value in received.getheaders():
                        if name.lower() not in {"transfer-encoding", "connection", "content-length"}:
                            self.send_header(name, value)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                finally:
                    upstream.close()

            do_GET = route
            do_POST = route

            def log_message(self, format, *args):
                pass

        cls.proxy = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Proxy)
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(certificate, private)
        cls.proxy.socket = tls.wrap_socket(cls.proxy.socket, server_side=True)
        cls.addClassCleanup(cls.proxy.server_close)
        cls.addClassCleanup(cls.proxy.shutdown)
        threading.Thread(target=cls.proxy.serve_forever, daemon=True).start()
        cls.url = f"https://127.0.0.1:{cls.proxy.server_port}"

    @classmethod
    def _seed_candidate(cls):
        payload = {"schemaVersion": 2, "snapshotId": "runtime-fixture", "site": {
            "host": "careers.synthetic.test", "pathPattern": "/synthetic-private-route"}, "sections": [{"sectionId": "s1", "fields": [{
            "candidateId": "f1", "element": "input", "control": "text", "visibility": "visible", "displayName": "synthetic-private-label"}]}]}
        request = urllib.request.Request(cls.url + "/api/v1/fields/analyze", data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, context=cls.context, timeout=15) as response:
            if response.status != 200:
                raise AssertionError("Synthetic analysis failed")

    @unittest.skipUnless(os.environ.get("QUALITY_PLAYWRIGHT_MODULE"), "Explicit isolated browser dependency")
    def test_management_browser_flow(self):
        completed = subprocess.run(("node", str(ROOT / "infra/tests/quality_browser.cjs"), json.dumps({
            "url": self.url, "password": "synthetic-only"})), capture_output=True, text=True, timeout=90)
        self.assertEqual(0, completed.returncode, completed.stdout + completed.stderr + (self.root / "backend.log").read_text())

    def test_observation_excludes_raw_labels_and_paths(self):
        self.log.flush()
        stored = subprocess.check_output(("docker", "exec", self.container, "mongosh", "--quiet", "cf164_runtime", "--eval",
            "EJSON.stringify(db.quality_records.find().toArray())"), text=True)
        self.assertTrue({"REQUEST", "CANDIDATE", "AGGREGATE"}.issubset({record["kind"] for record in json.loads(stored)}), stored)
        self.assertNotIn("synthetic-private-label", stored)
        self.assertNotIn("synthetic-private-route", stored)
        self.assertNotIn("synthetic-only", (self.root / "backend.log").read_text())

    def test_client_reports_join_reanalysis_without_changing_v2_response(self):
        def analyze(snapshot, candidate, headers):
            payload = {"schemaVersion": 2, "snapshotId": snapshot, "site": {"host": "report.synthetic.test", "pathPattern": "/public"},
                "sections": [{"sectionId": "s1", "fields": [{"candidateId": candidate, "element": "input", "control": "text", "visibility": "visible"}]}]}
            request = urllib.request.Request(self.url + "/api/v1/fields/analyze", data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json", "X-Career-Form-Capabilities": "quality-v1", "X-Career-Form-Version": "0.1.0", **headers})
            with urllib.request.urlopen(request, context=self.context, timeout=15) as response:
                body = json.load(response)
                self.assertEqual(snapshot, body["snapshotId"])
                self.assertNotIn("quality", body)
                return response.headers["X-Career-Form-Run"], response.headers["X-Career-Form-Report-Token"]

        def report(run, token, snapshot, candidate, event, finished=None):
            payload = {"eventId": event, "snapshotId": snapshot, "identities": {candidate: "e1"}, "fields": {
                candidate: {"bound": False, "attempted": False, "written": False, "retained": False, "reason": "NOT_MAPPED"}}, "finished": finished}
            request = urllib.request.Request(self.url + "/api/v1/quality/executions/" + run + "/report", data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
            with urllib.request.urlopen(request, context=self.context, timeout=15) as response:
                self.assertEqual(204, response.status)

        run, token = analyze("report-first", "c1", {})
        report(run, token, "report-first", "c1", "identity1")
        self.assertEqual((run, token), analyze("report-second", "c2", {"X-Career-Form-Run": run, "X-Career-Form-Report-Token": token}))
        report(run, token, "report-second", "c2", "identity2", "COMPLETED")
        report(run, token, "report-second", "c2", "identity2", "COMPLETED")
        request = urllib.request.Request(self.url + "/api/v1/quality/stats?site=report.synthetic.test&groupBy=ROUTE", headers={"Authorization": "Bearer synthetic-readonly"})
        with urllib.request.urlopen(request, context=self.context, timeout=15) as response:
            row = json.load(response)["rows"][0]
        self.assertEqual(2, row["analysisRequests"])
        self.assertEqual(1, row["executionCount"])
        self.assertEqual(1, row["uniqueCollected"])
        self.assertEqual(0, row["deduplicationUnknown"])
        self.assertEqual(0, row["aiCalls"])
        self.assertIsNone(row["inputSuccessRate"])
        self.assertEqual(1, row["unregistered"])
