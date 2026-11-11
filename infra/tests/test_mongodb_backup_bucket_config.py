import json
import re
import unittest
from pathlib import Path

from infra.tests import mongodb_backup_fakes as fakes


ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / "infra/mongodb/backup-bucket-policy-statement.json"
RULE = ROOT / "infra/mongodb/backup-lifecycle-rule.json"
BACKUP = fakes.load_script("mongodb-backup.py", "mongodb_backup_bucket_config")
BUCKET = "techcourse-project-2026"
PREFIX = "career-form/mongodb-backups"


class MongoDBBackupBucketConfigTest(unittest.TestCase):
    def test_policy_statement_denies_backup_reads_to_everyone_except_shared_ec2_role(self):
        statement = json.loads(POLICY.read_text())
        self.assertEqual({"Sid", "Effect", "Principal", "Action", "Resource", "Condition"}, set(statement))
        self.assertRegex(statement["Sid"], r"^CareerForm[A-Za-z0-9]+$")
        self.assertEqual("Deny", statement["Effect"])
        self.assertEqual("*", statement["Principal"])
        self.assertEqual(["s3:GetObject", "s3:GetObjectVersion"], sorted(statement["Action"]))
        self.assertEqual(f"arn:aws:s3:::{BUCKET}/{PREFIX}/*", statement["Resource"])
        self.assertEqual({"ArnNotEquals": {"aws:PrincipalArn": "arn:aws:iam::<AWS_ACCOUNT_ID>:role/ec2-project"}},
                         statement["Condition"])

    def test_policy_statement_keeps_uploads_and_other_team_paths_out_of_scope(self):
        statement = json.loads(POLICY.read_text())
        self.assertFalse(any(action.startswith(("s3:Put", "s3:Delete", "s3:List")) for action in statement["Action"]))
        self.assertTrue(statement["Resource"].startswith(f"arn:aws:s3:::{BUCKET}/career-form/"))
        self.assertNotIn("*", statement["Resource"][:-1])

    def test_lifecycle_rule_expires_backups_after_30_days_and_old_versions_after_one_day(self):
        rule = json.loads(RULE.read_text())
        self.assertEqual({
            "ID": "career-form-mongodb-backups-expire-30d",
            "Status": "Enabled",
            "Filter": {"Prefix": f"{PREFIX}/"},
            "Expiration": {"Days": 30},
            "NoncurrentVersionExpiration": {"NoncurrentDays": 1},
        }, rule)

    def test_bucket_files_match_backup_upload_location(self):
        bucket, prefix = BACKUP.parse_s3_uri(fakes.REMOTE)
        statement = json.loads(POLICY.read_text())
        rule = json.loads(RULE.read_text())
        self.assertEqual((BUCKET, PREFIX), (bucket, prefix))
        self.assertEqual(f"arn:aws:s3:::{bucket}/{prefix}/*", statement["Resource"])
        self.assertEqual(f"{prefix}/", rule["Filter"]["Prefix"])

    def test_files_hold_no_real_account_identifiers(self):
        for path in (POLICY, RULE):
            with self.subTest(path=path.name):
                self.assertIsNone(re.search(r"\d{12}", path.read_text()))


if __name__ == "__main__":
    unittest.main()
