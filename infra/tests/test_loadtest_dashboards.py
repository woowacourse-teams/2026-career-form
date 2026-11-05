import json
import unittest
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1] / 'monitoring'

class LoadtestDashboardsTest(unittest.TestCase):
    def test_folder_has_independent_mounted_path(self):
        providers = yaml.safe_load((ROOT / 'grafana/provisioning/dashboards/dashboards.yaml').read_text())['providers']
        provider = next(p for p in providers if p['folder'] == '부하테스트')
        old = next(p for p in providers if p['folder'] == 'Career Form')
        self.assertFalse(provider['options']['path'].startswith(old['options']['path'] + '/'))
        mounts = yaml.safe_load((ROOT / 'compose.yaml').read_text())['services']['grafana']['volumes']
        self.assertTrue(any(m.get('target') == provider['options']['path'] and m.get('read_only') for m in mounts if isinstance(m, dict)))

    def test_dashboards_keep_missing_data_and_production_defaults(self):
        docs = [json.loads(p.read_text()) for p in (ROOT / 'grafana/loadtest-dashboards').glob('*.json')]
        self.assertEqual({'운영서버 상태', 'DB 상태'}, {d['title'] for d in docs})
        self.assertEqual(2, len({d['uid'] for d in docs}))
        for d in docs:
            variables = {v['name']: v for v in d['templating']['list']}
            self.assertEqual('prod', variables['env']['current']['value'])
            self.assertTrue(all(link['keepTime'] and link['includeVars'] for link in d['links']))
            def walk(panels):
                for panel in panels:
                    yield panel
                    yield from walk(panel.get('panels', []))
            for p in walk(d['panels']):
                if p['type'] == 'timeseries':
                    self.assertFalse(p['fieldConfig']['defaults']['custom']['spanNulls'])
                    for t in p['targets']:
                        self.assertNotIn('or vector(0)', t['expr'])
                        self.assertEqual('prometheus', p['datasource']['uid'])

    def test_db_overview_and_detail_remain_separate(self):
        d = json.loads((ROOT / 'grafana/loadtest-dashboards/mongodb.json').read_text())
        charts = [p for p in d['panels'] if p['type'] == 'timeseries']
        self.assertEqual(6, len(charts))
        latency = next(p for p in charts if p['id'] == 12)
        self.assertTrue(all('career_form_mongo_operation_seconds_bucket' in t['expr'] for t in latency['targets']))
        detail = next(p for p in d['panels'] if p['id'] == 203)
        self.assertTrue(detail['collapsed'])
        self.assertEqual(5, len(detail['panels']))
        self.assertTrue(any(p['id'] == 34 for p in detail['panels']))
