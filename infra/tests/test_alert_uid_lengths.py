import json
import unittest
from pathlib import Path

class AlertUidLengthsTest(unittest.TestCase):
    def test_alert_uids_are_short_and_unique(self):
        root = Path(__file__).resolve().parents[1] / 'monitoring/grafana/provisioning/alerting'
        seen = set()
        for path in root.glob('*.json'):
            for group in json.loads(path.read_text()).get('groups', []):
                for rule in group.get('rules', []):
                    uid = rule['uid']
                    self.assertLessEqual(len(uid), 40, f'{path.name}: {uid}')
                    self.assertNotIn(uid, seen)
                    seen.add(uid)
