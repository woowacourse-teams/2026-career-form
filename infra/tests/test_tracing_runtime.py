import base64
import json
import os
import shutil
import subprocess
import statistics
from pathlib import Path
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid

from infra.tests.monitoring_runtime_fixture import MonitoringFixture, ROOT


@unittest.skipUnless(os.environ.get('RUN_TRACING_INTEGRATION') == '1',
                     'Requires isolated Docker and career-form-backend:cf-213 image')
class TracingRuntimeTest(MonitoringFixture, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory(prefix='cf-213-tracing-')
        cls.root = Path(cls.workspace.name)
        cls.project = 'cf-213-tracing-' + str(os.getpid())
        cls.configuration = cls.root / 'compose.json'
        cls.password = 'synthetic-integration-password'
        cls.environment = {**os.environ, 'COMPOSE_PROFILES': 'tracing',
            'MONITORING_PRIVATE_IP': '127.0.0.1',
            'MONITORING_DATA_DIR': str(cls.root / 'data'),
            'MONITORING_SECRETS_DIR': str(cls.root / 'secrets')}
        cls._start_receiver()
        cls._prepare_secrets()
        config = cls._central_config()
        cls._host_metrics(config)
        # Trace-only fixture: unrelated DB alert provisioning currently has overlong UIDs.
        shutil.rmtree(cls.root / 'monitoring/grafana/provisioning/alerting')
        data = cls.root / 'data/tempo'
        data.mkdir(); data.chmod(0o777)
        cls.backend_port = cls._port()
        config['services']['mongodb'] = {'image': 'mongo:8.0-noble',
                                        'command': ['mongod', '--quiet']}
        token = base64.b64encode(f'synthetic:{cls.password}'.encode()).decode()
        config['services']['backend'] = {
            'image': 'career-form-backend:cf-213',
            'environment': {'SPRING_PROFILES_ACTIVE': 'local',
                'SPRING_MONGODB_URI': 'mongodb://mongodb:27017/synthetic',
                'CAREER_FORM_LLM_ENABLED': 'false', 'CAREER_FORM_ANALYSIS_ENABLED': 'false',
                'CAREER_FORM_OTEL_ENABLED': 'true',
                'OTEL_SERVICE_NAME': 'career-form-backend',
                'OTEL_RESOURCE_ATTRIBUTES': 'deployment.environment.name=synthetic',
                'OTEL_EXPORTER_OTLP_ENDPOINT': 'http://ingest:4318',
                'OTEL_EXPORTER_OTLP_HEADERS': 'Authorization=Basic%20' + token,
                'OTEL_TRACES_SAMPLER': 'always_on', 'OTEL_BSP_SCHEDULE_DELAY': '100'},
            'ports': [{'target': 8080, 'published': str(cls.backend_port), 'host_ip': '127.0.0.1'}]}
        cls._start_stack(config)
        cls.wait_for(lambda: cls.backend('/actuator/health')[0] == 200)

    @staticmethod
    def wait_for(action, seconds=60):
        end = time.monotonic() + seconds
        last = None
        while time.monotonic() < end:
            try:
                last = action()
                if last:
                    return last
            except (OSError, ValueError, KeyError):
                pass
            time.sleep(.5)
        raise AssertionError(f'Condition timed out; last={last}')

    @classmethod
    def backend(cls, path, data=None, trace=None):
        headers = {'Content-Type': 'application/json'}
        if trace:
            headers['traceparent'] = f'00-{trace}-1234567890abcdef-01'
        request = urllib.request.Request(f'http://127.0.0.1:{cls.backend_port}{path}',
                                         data=data, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    @classmethod
    def tempo(cls, path):
        return cls._get('/api/datasources/proxy/uid/tempo' + path)

    @classmethod
    def trace(cls, identifier):
        return cls.wait_for(lambda: cls.tempo('/api/traces/' + identifier))

    def test_actual_agent_http_db_and_method_spans_are_searchable(self):
        identifier = uuid.uuid4().hex
        status, _ = self.backend('/actuator/health?synthetic=DO_NOT_STORE', trace=identifier)
        self.assertEqual(200, status)
        trace = self.trace(identifier)
        encoded = json.dumps(trace)
        self.assertNotIn('DO_NOT_STORE', encoded)
        self.assertIn('http.response.status_code', encoded)
        self.assertIn('db.system', encoded)
        query = urllib.parse.urlencode({'q': '{ resource.service.name = "career-form-backend" && resource.deployment.environment.name = "synthetic" }'})
        self.assertTrue(self.wait_for(lambda: self.tempo('/api/search?' + query).get('traces')))
        identifier = uuid.uuid4().hex
        fixture = ROOT / 'backend/src/test/resources/formanalysis/fields-request-v2.json'
        status, _ = self.backend('/api/v1/fields/analyze', fixture.read_bytes(), identifier)
        self.assertEqual(200, status)
        encoded = json.dumps(self.trace(identifier))
        self.assertIn('FieldsAnalysisService', encoded)
        self.assertIn('analyze', encoded)

    def test_proxy_auth_and_trace_payload_sanitization(self):
        url = f'http://127.0.0.1:{self.ports["traces"]}/v1/traces'
        with self.assertRaises(urllib.error.HTTPError) as denied:
            urllib.request.urlopen(urllib.request.Request(url, data=b'{}'), timeout=5)
        self.assertEqual(401, denied.exception.code)
        denied.exception.close()
        marker = 'SYNTHETIC_PRIVATE_VALUE'
        attr = lambda key, value: {'key': key, 'value': {'stringValue': value}}
        identifier = uuid.uuid4().hex
        now = time.time_ns()
        payload = {'resourceSpans': [{'resource': {'attributes': [attr('service.name', 'synthetic-privacy'),
            attr('deployment.environment.name', 'synthetic'), attr('process.command_line', marker)]},
            'scopeSpans': [{'scope': {'name': 'synthetic', 'attributes': [attr('private', marker)]},
                'spans': [{'traceId': identifier, 'spanId': '1234567890abcdef',
                    'name': marker, 'kind': 2, 'startTimeUnixNano': str(now-200000000),
                    'endTimeUnixNano': str(now), 'status': {'code': 2, 'message': marker},
                    'attributes': [attr('url.full', marker), attr('db.statement', marker), attr('http.request.header.authorization', marker)],
                    'events': [{'name': marker, 'timeUnixNano': str(now), 'attributes': [attr('exception.message', marker)]}],
                    'links': []}]}]}]}
        # A linked span must be excluded entirely, including arbitrary link attributes.
        payload['resourceSpans'][0]['scopeSpans'][0]['spans'].append({
            'traceId': identifier, 'spanId': 'abcdef1234567890', 'name': marker,
            'startTimeUnixNano': str(now-100000000), 'endTimeUnixNano': str(now),
            'links': [{'traceId': uuid.uuid4().hex, 'spanId': '1234567890abcdef',
                       'attributes': [attr('private', marker)]}]})
        token = base64.b64encode(f'synthetic:{self.password}'.encode()).decode()
        request = urllib.request.Request(url, data=json.dumps(payload).encode(),
            headers={'Authorization': 'Basic ' + token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=10) as response:
            self.assertEqual(200, response.status)
        trace = self.trace(identifier)
        self.assertNotIn(marker, json.dumps(trace))
        self.assertEqual(1, len(list(self.spans(trace))))
        self.assertIn('STATUS_CODE_ERROR', json.dumps(trace))
        query = urllib.parse.urlencode({'q': '{ resource.service.name = "synthetic-privacy" && status = error && duration > 100ms }'})
        self.assertTrue(self.wait_for(lambda: self.tempo('/api/search?' + query).get('traces')))

    @staticmethod
    def spans(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == 'spans':
                    yield from item
                else:
                    yield from TracingRuntimeTest.spans(item)
        elif isinstance(value, list):
            for item in value:
                yield from TracingRuntimeTest.spans(item)

    def test_http_client_stub_latency_and_error_share_a_trace(self):
        classes = self.root / 'probe'
        classes.mkdir()
        subprocess.run(['javac', '--release', '21', '-d', str(classes),
            str(ROOT / 'infra/tests/tracing/TraceProbe.java')], check=True, capture_output=True)
        config = json.loads(self.configuration.read_text())
        environment = dict(config['services']['backend']['environment'])
        environment.update({'OTEL_SERVICE_NAME': 'synthetic-http-probe',
            'OTEL_INSTRUMENTATION_METHODS_INCLUDE': 'TraceProbe[call]'})
        config['services']['probe'] = {
            'image': 'career-form-backend:cf-213', 'environment': environment,
            'command': ['java', '-cp', '/probe', 'TraceProbe'],
            'volumes': [{'type': 'bind', 'source': str(classes), 'target': '/probe', 'read_only': True}]}
        self.configuration.write_text(json.dumps(config))
        result = self._compose('run', '--rm', 'probe')
        self.assertEqual(0, result.returncode, result.stderr)
        query = urllib.parse.urlencode({'q': '{ resource.service.name = "synthetic-http-probe" && status = error && duration > 100ms }'})
        matches = self.wait_for(lambda: self.tempo('/api/search?' + query).get('traces'))
        trace = self.trace(matches[0]['traceID'])
        self.assertNotIn('SYNTHETIC_PRIVATE_PROBE', json.dumps(trace))
        spans = list(self.spans(trace))
        self.assertTrue(any(span.get('kind') == 'SPAN_KIND_CLIENT' for span in spans))
        identifiers = {span['spanId'] for span in spans}
        self.assertTrue(any(span.get('parentSpanId') in identifiers for span in spans))

    def test_toggle_and_small_sequential_overhead_sample(self):
        config = json.loads(self.configuration.read_text())
        results = {}
        try:
            for enabled in (True, False):
                config['services']['backend']['environment']['CAREER_FORM_OTEL_ENABLED'] = str(enabled).lower()
                self.configuration.write_text(json.dumps(config))
                self.assertEqual(0, self._compose('up', '-d', '--force-recreate', 'backend').returncode)
                self.wait_for(lambda: self.backend('/actuator/health')[0] == 200)
                for _ in range(10):
                    self.backend('/actuator/health')
                storage_before = sum(p.stat().st_size for p in (self.root / 'data/tempo').rglob('*') if p.is_file())
                samples = []
                for _ in range(60):
                    start = time.perf_counter()
                    self.assertEqual(200, self.backend('/actuator/health')[0])
                    samples.append((time.perf_counter() - start) * 1000)
                time.sleep(2)
                storage_after = sum(p.stat().st_size for p in (self.root / 'data/tempo').rglob('*') if p.is_file())
                stats = subprocess.check_output(['docker', 'stats', '--no-stream', '--format', '{{json .}}',
                    self.project + '-backend-1'], text=True)
                results[str(enabled).lower()] = {'requests': len(samples), 'tempo_bytes_delta': storage_after-storage_before,
                    'median_ms': round(statistics.median(samples), 2),
                    'p95_ms': round(sorted(samples)[56], 2), 'container': json.loads(stats)}
                identifier = uuid.uuid4().hex
                self.assertEqual(200, self.backend('/actuator/health', trace=identifier)[0])
                if enabled:
                    self.trace(identifier)
                else:
                    time.sleep(3)
                    with self.assertRaises(urllib.error.HTTPError) as absent:
                        self.tempo('/api/traces/' + identifier)
                    self.assertEqual(404, absent.exception.code)
                    absent.exception.close()
            print('TRACE_SAMPLE ' + json.dumps(results), flush=True)
        finally:
            config['services']['backend']['environment']['CAREER_FORM_OTEL_ENABLED'] = 'true'
            self.configuration.write_text(json.dumps(config))
            self._compose('up', '-d', '--force-recreate', 'backend')
            self.wait_for(lambda: self.backend('/actuator/health')[0] == 200)

    def test_z_collector_outage_does_not_break_requests(self):
        self.assertEqual(0, self._compose('stop', 'host-metrics').returncode)
        try:
            self.assertEqual(200, self.backend('/actuator/health')[0])
        finally:
            self.assertEqual(0, self._compose('start', 'host-metrics').returncode)
