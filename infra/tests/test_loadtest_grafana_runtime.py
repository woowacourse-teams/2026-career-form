"""Isolated provisioning check; no production data or existing alert rules."""
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
import urllib.request
import yaml

ROOT = Path(__file__).resolve().parents[1] / 'monitoring'

@unittest.skipUnless(os.environ.get('RUN_LOADTEST_GRAFANA') == '1', 'Explicit isolated Grafana check')
class LoadtestGrafanaRuntimeTest(unittest.TestCase):
    def test_folder_and_both_dashboards_are_provisioned(self):
        with tempfile.TemporaryDirectory(prefix='cf-loadtest-') as tmp:
            root = Path(tmp)
            shutil.copytree(ROOT / 'grafana', root / 'grafana')
            shutil.rmtree(root / 'grafana/provisioning/alerting')
            # Dashboard provisioning is independent of external plugin installation.
            ds = root / 'grafana/provisioning/datasources'
            shutil.rmtree(ds)
            ds.mkdir()
            (ds / 'prometheus.yaml').write_text(yaml.safe_dump({'apiVersion': 1, 'datasources': [{'name': 'Prometheus', 'uid': 'prometheus', 'type': 'prometheus', 'url': 'http://127.0.0.1:9090'}]}))
            name = f'cf-loadtest-{os.getpid()}'
            image = yaml.safe_load((ROOT / 'compose.yaml').read_text())['services']['grafana']['image']
            args = ['docker', 'run', '-d', '--rm', '--name', name, '-p', '127.0.0.1::3000', '-e', 'GF_SECURITY_ADMIN_PASSWORD=synthetic-loadtest', '-e', 'GF_PLUGINS_PREINSTALL_DISABLED=true']
            for source, target in [('provisioning', 'provisioning'), ('dashboards', 'dashboards'), ('loadtest-dashboards', 'loadtest-dashboards')]:
                args += ['-v', f'{root}/grafana/{source}:/etc/grafana/{target}:ro']
            subprocess.run(args + [image], check=True, capture_output=True)
            try:
                port = subprocess.check_output(['docker', 'port', name, '3000'], text=True).strip().rsplit(':', 1)[1]
                def get(path):
                    request = urllib.request.Request(f'http://127.0.0.1:{port}{path}')
                    request.add_header('Authorization', 'Basic ' + base64.b64encode(b'admin:synthetic-loadtest').decode())
                    with urllib.request.urlopen(request, timeout=3) as response:
                        return json.load(response)
                for attempt in range(60):
                    try:
                        folder = get('/api/folders/cf-loadtest')
                        break
                    except Exception:
                        if attempt == 59:
                            self.fail(subprocess.check_output(['docker', 'logs', name], text=True))
                        time.sleep(1)
                self.assertEqual('부하테스트', folder['title'])
                for uid in ['cf-loadtest-server', 'cf-loadtest-db']:
                    result = get('/api/dashboards/uid/' + uid)
                    self.assertEqual('cf-loadtest', result['meta']['folderUid'])
                    self.assertTrue(result['meta']['provisioned'])
                    dashboard = result['dashboard']
                    self.assertNotIn('가상 데이터', json.dumps(dashboard, ensure_ascii=False))
                    if uid == 'cf-loadtest-db':
                        self.assertEqual(6, sum(p['type'] == 'timeseries' for p in dashboard['panels']))
                        detail = next(p for p in dashboard['panels'] if p['id'] == 203)
                        self.assertTrue(detail['collapsed'])
                        self.assertEqual(5, len(detail['panels']))
            finally:
                subprocess.run(['docker', 'stop', name], check=True, capture_output=True)
