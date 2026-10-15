import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ENTRYPOINT = ROOT / 'backend/docker-entrypoint.sh'


class TracingEntrypointTest(unittest.TestCase):
    def run_entrypoint(self, overrides):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / 'java'
            executable.write_text('#!/bin/sh\nprintf "options=%s\\n" "$JAVA_TOOL_OPTIONS"\nprintf "arg=%s\\n" "$@"\n')
            executable.chmod(0o755)
            env = {'PATH': directory + ':' + os.environ['PATH'], **overrides}
            return subprocess.run(['sh', str(ENTRYPOINT), 'java', '-jar', 'application.jar'],
                                  env=env, text=True, capture_output=True)

    def test_disabled_preserves_existing_jvm_options_and_arguments(self):
        result = self.run_entrypoint({'JAVA_TOOL_OPTIONS': '-Xmx256m'})
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn('options=-Xmx256m\n', result.stdout)
        self.assertNotIn('-javaagent:', result.stdout)
        self.assertIn('arg=application.jar', result.stdout)

    def test_enabled_adds_agent_without_replacing_jvm_options(self):
        result = self.run_entrypoint({'CAREER_FORM_OTEL_ENABLED': 'true',
            'OTEL_EXPORTER_OTLP_ENDPOINT': 'http://ingest:4318',
            'JAVA_TOOL_OPTIONS': '-Xmx256m'})
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn('-Xmx256m -javaagent:/otel/opentelemetry-javaagent.jar', result.stdout)

    def test_enabled_requires_explicit_endpoint_and_does_not_echo_headers(self):
        result = self.run_entrypoint({'CAREER_FORM_OTEL_ENABLED': 'true',
                                      'OTEL_EXPORTER_OTLP_HEADERS': 'synthetic-secret'})
        self.assertNotEqual(0, result.returncode)
        self.assertNotIn('synthetic-secret', result.stdout + result.stderr)

    def test_invalid_toggle_fails_before_starting_java(self):
        result = self.run_entrypoint({'CAREER_FORM_OTEL_ENABLED': 'tru'})
        self.assertNotEqual(0, result.returncode)
        self.assertNotIn('arg=', result.stdout)

class TracingComposeTest(unittest.TestCase):
    def test_profile_scoped_env_file_supplies_toggle_credentials_and_jvm_options(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            settings = Path(directory) / 'staging.env'
            settings.write_text('CAREER_FORM_OTEL_ENABLED=true\n'
                                'OTEL_EXPORTER_OTLP_ENDPOINT=http://ingest:4318\n'
                                'OTEL_EXPORTER_OTLP_HEADERS=Authorization=synthetic\n'
                                'JAVA_TOOL_OPTIONS=-Xmx256m\n')
            env = {**os.environ, 'CAREER_FORM_OTEL_ENV_FILE': str(settings),
                'SPRING_PROFILES_ACTIVE': 'staging', 'SPRING_MONGODB_URI': 'mongodb://synthetic/db',
                'OPENAI_API_KEY': 'synthetic', 'BACKEND_PORT': '18081',
                'BACKEND_IMAGE': 'synthetic@sha256:' + 'a' * 64}
            result = subprocess.run(['docker', 'compose', '-f', str(ROOT / 'infra/compose.deploy.yaml'),
                'config', '--format', 'json'], env=env, capture_output=True, text=True)
            self.assertEqual(0, result.returncode, result.stderr)
            backend = json.loads(result.stdout)['services']['backend']['environment']
            self.assertEqual('true', backend['CAREER_FORM_OTEL_ENABLED'])
            self.assertEqual('-Xmx256m', backend['JAVA_TOOL_OPTIONS'])
            self.assertEqual('Authorization=synthetic', backend['OTEL_EXPORTER_OTLP_HEADERS'])
            self.assertEqual('deployment.environment.name=staging', backend['OTEL_RESOURCE_ATTRIBUTES'])

    def test_tempo_requires_opt_in_and_has_no_public_ingest_or_query_port(self):
        import yaml
        compose = yaml.safe_load((ROOT / 'infra/monitoring/compose.yaml').read_text())
        tempo = compose['services']['tempo']
        self.assertEqual(['tracing'], tempo['profiles'])
        self.assertFalse(tempo.get('ports'))
        self.assertRegex(tempo['image'], r'@sha256:[a-f0-9]{64}$')
        data = next(v for v in tempo['volumes'] if v['target'] == '/var/tempo')
        self.assertFalse(data['bind']['create_host_path'])


if __name__ == '__main__':
    unittest.main()
