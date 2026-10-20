import json
import unittest
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1] / 'monitoring'

class LoadtestDashboardsTest(unittest.TestCase):
    def quality_panels(self):
        dashboard = json.loads((ROOT / 'grafana/loadtest-dashboards/backend.json').read_text())
        return [panel for panel in dashboard['panels'] if 20 <= panel['id'] <= 27]

    def test_quality_row_follows_existing_jvm_charts_without_overlap(self):
        dashboard = json.loads((ROOT / 'grafana/loadtest-dashboards/backend.json').read_text())
        existing = [panel for panel in dashboard['panels'] if panel['id'] != 203 and not 20 <= panel['id'] <= 27]
        row = next(panel for panel in dashboard['panels'] if panel['id'] == 203)
        self.assertEqual('품질 비동기 작업', row['title'])
        self.assertEqual('row', row['type'])
        self.assertFalse(row['collapsed'])
        self.assertEqual(max(panel['gridPos']['y'] + panel['gridPos']['h'] for panel in existing), row['gridPos']['y'])
        self.assertEqual(8, len(self.quality_panels()))
        self.assertEqual(len(dashboard['panels']), len({panel['id'] for panel in dashboard['panels']}))
        for index, panel in enumerate(dashboard['panels']):
            a = panel['gridPos']
            self.assertGreaterEqual(a['x'], 0)
            self.assertLessEqual(a['x'] + a['w'], 24)
            for other in dashboard['panels'][index + 1:]:
                b = other['gridPos']
                self.assertFalse(a['x'] < b['x'] + b['w'] and b['x'] < a['x'] + a['w']
                                 and a['y'] < b['y'] + b['h'] and b['y'] < a['y'] + a['h'],
                                 f"Overlapping panels: {panel['id']}, {other['id']}")
        self.assertTrue(all(panel['gridPos']['y'] > row['gridPos']['y'] for panel in self.quality_panels()))

    def test_quality_charts_use_existing_metrics_and_keep_instances_and_missing_data(self):
        charts = self.quality_panels()
        self.assertEqual(8, len(charts))
        expressions = '\n'.join(target['expr'] for panel in charts for target in panel['targets'])
        for metric in ('quality_tasks_waiting', 'quality_tasks_active', 'quality_tasks_retained_bytes',
                       'quality_tasks_queue_wait_seconds_sum', 'quality_tasks_queue_wait_seconds_count',
                       'quality_tasks_execution_seconds_sum', 'quality_tasks_execution_seconds_count',
                       'quality_tasks_total', 'quality_aggregate_pending', 'quality_aggregate_oldest_seconds',
                       'quality_aggregate_total'):
            self.assertIn(metric, expressions)
        for panel in charts:
            self.assertEqual('prometheus', panel['datasource']['uid'])
            self.assertEqual('데이터 없음', panel['fieldConfig']['defaults']['noValue'])
            self.assertFalse(panel['fieldConfig']['defaults']['custom']['spanNulls'])
            self.assertTrue(panel.get('description'))
            for target in panel['targets']:
                self.assertIn('env="$env"', target['expr'])
                self.assertIn('instance', target['expr'])
                self.assertIn('{{instance}}', target['legendFormat'])
                self.assertNotIn('or vector(0)', target['expr'])
                self.assertNotIn('_bucket', target['expr'])
        for metric in ('quality_tasks_total', 'quality_aggregate_total'):
            target = next(target for panel in charts for target in panel['targets'] if metric in target['expr'])
            self.assertIn('rate(', target['expr'])
            self.assertIn('outcome', target['expr'])
            self.assertIn('{{outcome}}', target['legendFormat'])

    def test_quality_mean_times_use_rates_and_exclude_zero_observations(self):
        charts = self.quality_panels()
        for metric in ('quality_tasks_queue_wait_seconds', 'quality_tasks_execution_seconds'):
            target = next(target for panel in charts for target in panel['targets'] if metric + '_sum' in target['expr'])
            self.assertIn('rate(' + metric + '_sum', target['expr'])
            self.assertIn('rate(' + metric + '_count', target['expr'])
            self.assertIn(' / ', target['expr'])
            self.assertIn(' > 0', target['expr'])
            self.assertIn('and on', target['expr'])
            self.assertIn('$__rate_interval', target['expr'])

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
