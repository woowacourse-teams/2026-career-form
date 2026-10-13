import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class MongoDBHostStateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("mongodb_host_state", ROOT / "infra/scripts/mongodb-host-state.py")
        cls.agent = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.agent)

    def test_preserves_oom_evidence_after_restart_and_detects_new_boot(self):
        state = {"Running": False, "OOMKilled": True, "ExitCode": 137, "StartedAt": "first"}
        first = self.agent.observe(state, 2, "boot-one", 7, {}, 100)
        running = {"Running": True, "OOMKilled": False, "ExitCode": 0, "StartedAt": "second"}
        next_value = self.agent.observe(running, 3, "boot-one", 7, first, 120)
        self.assertEqual(100, next_value["last_oom"])
        self.assertEqual(120, next_value["last_restart"])
        self.assertEqual(1, next_value["running"])
        reboot = self.agent.observe(running, 0, "boot-two", 0, next_value, 150)
        self.assertEqual(0, reboot["host_oom_count"])
        self.assertEqual(100, reboot["last_oom"])

    def test_host_oom_increment_is_detected_without_container_oom_flag(self):
        running = {"Running": True, "OOMKilled": False, "ExitCode": 0, "StartedAt": "first"}
        first = self.agent.observe(running, 0, "boot", 3, {}, 100)
        later = self.agent.observe(running, 0, "boot", 4, first, 130)
        self.assertEqual(130, later["last_host_oom"])
        self.assertEqual(0, later["last_oom"])

    def test_oom_incident_requires_five_minutes_of_healthy_db_and_memory(self):
        stopped = {"Running": False, "OOMKilled": True, "ExitCode": 137, "StartedAt": "first"}
        incident = self.agent.observe(stopped, 0, "boot", 0, {}, 100, memory_available=4)
        running = {"Running": True, "OOMKilled": False, "ExitCode": 0, "StartedAt": "second",
                   "Health": {"Status": "healthy"}}
        healthy = self.agent.observe(running, 1, "boot", 0, incident, 120, memory_available=20)
        self.assertEqual(1, healthy["oom_active"])
        self.assertEqual(120, healthy["healthy_since"])
        recovered = healthy
        for now in range(135, 421, 15):
            recovered = self.agent.observe(running, 1, "boot", 0, recovered, now, memory_available=20)
        self.assertEqual(0, recovered["oom_active"])
        self.assertEqual(100, recovered["last_oom"])

    def test_gap_and_low_memory_restart_oom_recovery_clock(self):
        stopped = {"Running": False, "OOMKilled": True, "ExitCode": 137}
        value = self.agent.observe(stopped, 0, "boot", 0, {}, 100)
        running = {"Running": True, "OOMKilled": False, "Health": {"Status": "healthy"}}
        for now in range(115, 401, 15):
            value = self.agent.observe(running, 1, "boot", 0, value, now, memory_available=20)
        value = self.agent.observe(running, 1, "boot", 0, value, 460, memory_available=20)
        self.assertEqual(1, value["oom_active"])
        self.assertEqual(460, value["healthy_since"])
        value = self.agent.observe(running, 1, "boot", 0, value, 475, memory_available=4)
        value = self.agent.observe(running, 1, "boot", 0, value, 490, memory_available=20)
        self.assertEqual(490, value["healthy_since"])
        self.assertEqual(1, value["oom_active"])

    def test_publishes_atomic_metrics_and_safe_events_without_container_payload(self):
        state = {"Running": True, "OOMKilled": False, "ExitCode": 0, "StartedAt": "first", "Error": "private-error"}
        value = self.agent.observe(state, 1, "boot", 0, {}, 100)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.agent.publish(root, value, 100, root)
            metrics = (root / "mongodb.prom").read_text()
            self.assertIn("career_mongo_container_running 1", metrics)
            self.assertIn("career_mongo_host_state_timestamp_seconds 100", metrics)
            self.assertNotIn("private-error", "".join(p.read_text() for p in root.iterdir()))
            self.assertEqual(1, json.loads((root / "state.json").read_text())["running"])
            self.assertFalse((root / "mongodb.prom.tmp").exists())
