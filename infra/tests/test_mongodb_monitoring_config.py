import importlib.util
import unittest
from pathlib import Path


class MongoDBMonitoringConfigTest(unittest.TestCase):
    def test_rejects_shared_database_mapping_and_template_syntax(self):
        path = Path(__file__).resolve().parents[2] / "infra/scripts/validate-mongodb-monitoring.py"
        spec = importlib.util.spec_from_file_location("mongodb_monitoring_config", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        valid = {"HOST_INSTANCE": "career-db", "MONITORING_PRIVATE_IP": "10.0.0.10",
            "MONGODB_DEV_DATABASE": "sample_dev", "MONGODB_STAGING_DATABASE": "sample_staging", "MONGODB_PROD_DATABASE": "sample_prod"}
        self.assertEqual([], module.validate_environment(valid))
        self.assertTrue(module.validate_environment({**valid, "MONGODB_PROD_DATABASE": "sample_dev"}))
        self.assertTrue(module.validate_environment({**valid, "MONGODB_PROD_DATABASE": '{{.Value}}'}))
        self.assertTrue(module.validate_environment({**valid, "MONITORING_PRIVATE_IP": "8.8.8.8"}))
        self.assertTrue(module.validate_environment({**valid, "HOST_INSTANCE": "other-host"}))
