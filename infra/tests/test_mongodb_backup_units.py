import configparser
import re
import unittest
from pathlib import Path
from unittest import mock

from infra.tests import mongodb_backup_fakes as fakes


ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "infra/mongodb/mongodb-backup.service"
TIMER = ROOT / "infra/mongodb/mongodb-backup.timer"
RUNBOOK = ROOT / "infra/mongodb/BACKUP.md"
HOST_STATE = ROOT / "infra/monitoring/mongodb/host-state.service"
BACKUP = fakes.load_script("mongodb-backup.py", "mongodb_backup_units")
REHEARSAL = fakes.load_script("mongodb-restore-rehearsal.py", "mongodb_restore_rehearsal_units")
SECTIONS = ("주기, 위치, 보관", "백업 범위와 이유", "계정과 권한", "복구에 필요한 키와 비밀값", "호스트 설치",
            "공용 버킷과 역할 설정", "복구가 필요한 상황", "운영 복구 절차", "정합 확인", "RPO와 RTO",
            "복구 기록 양식", "완료 조건 근거", "주의 사항")


def unit(path: Path) -> configparser.ConfigParser:
    parser = configparser.ConfigParser(strict=False, interpolation=None, delimiters=("=",))
    parser.optionxform = str
    parser.read_string(path.read_text())
    return parser


class MongoDBBackupUnitsTest(unittest.TestCase):
    def test_service_keeps_host_state_hardening_with_owner_only_umask(self):
        service = unit(SERVICE)["Service"]
        host_state = unit(HOST_STATE)["Service"]
        self.assertEqual(host_state["Type"], service["Type"])
        self.assertEqual("oneshot", service["Type"])
        self.assertIn("EnvironmentFile", host_state)
        self.assertEqual("/etc/career-form/mongodb-backup.env", service["EnvironmentFile"])
        self.assertEqual(host_state["NoNewPrivileges"], service["NoNewPrivileges"])
        self.assertEqual("true", service["NoNewPrivileges"])
        self.assertEqual("0077", service["UMask"])
        self.assertIn("docker.service", unit(SERVICE)["Unit"]["After"].split())

    def test_service_runs_installed_script_with_env_file_and_no_secret_arguments(self):
        service = unit(SERVICE)["Service"]
        self.assertEqual(["/usr/bin/python3", "/opt/career-form/mongodb-backup/mongodb-backup.py",
                          "--env-file", "/etc/career-form/mongodb-backup.env"], service["ExecStart"].split())
        self.assertNotIn("$", service["ExecStart"])
        self.assertNotIn("URI", SERVICE.read_text())

    def test_service_gives_secret_files_a_private_runtime_directory_visible_to_docker(self):
        service = unit(SERVICE)["Service"]
        self.assertEqual("career-form-mongodb-backup", service["RuntimeDirectory"])
        self.assertEqual("0700", service["RuntimeDirectoryMode"])
        self.assertNotIn("PrivateTmp", service)
        self.assertIn("TimeoutStartSec", service)

    def test_timer_wakes_service_at_04_10_16_22_seoul_and_catches_up_after_downtime(self):
        timer = unit(TIMER)
        self.assertEqual("*-*-* 04,10,16,22:00:00 Asia/Seoul", timer["Timer"]["OnCalendar"])
        self.assertEqual("true", timer["Timer"]["Persistent"])
        self.assertEqual("mongodb-backup.service", timer["Timer"]["Unit"])
        self.assertEqual("timers.target", timer["Install"]["WantedBy"])
        self.assertNotIn("OnBootSec", timer["Timer"])
        self.assertNotIn("OnUnitActiveSec", timer["Timer"])

    def test_script_puts_secret_files_under_systemd_runtime_directory(self):
        workspace = fakes.BackupWorkspace(self)
        code, output, errors = workspace.run(BACKUP)
        self.assertEqual(0, code, output + errors)
        mounts = [fakes.option(call["args"], "-v")[0].split(":")[0] for call in workspace.calls("docker")
                  if fakes.option(call["args"], "-v")]
        self.assertTrue(mounts)
        self.assertTrue(all(Path(mount).parent == workspace.runtime for mount in mounts))
        self.assertEqual([], list(workspace.runtime.iterdir()))


def runbook_env() -> dict:
    text = RUNBOOK.read_text()
    block = next(part for part in text.split("```") if "MONGODB_BACKUP_URI=" in part)
    return dict(line.strip().split("=", 1) for line in block.splitlines() if "=" in line)


class MongoDBBackupRunbookTest(unittest.TestCase):
    def test_runbook_has_every_required_section(self):
        headings = [line[3:] for line in RUNBOOK.read_text().splitlines() if line.startswith("## ")]
        self.assertEqual(list(SECTIONS), headings)

    def test_runbook_env_example_matches_script_settings_and_locations(self):
        values = runbook_env()
        self.assertEqual(set(BACKUP.REQUIRED), set(values))
        self.assertEqual(fakes.REMOTE, values["MONGODB_BACKUP_S3_URI"])
        self.assertEqual("7", values["MONGODB_BACKUP_RETENTION_DAYS"])
        self.assertEqual(REHEARSAL.DEFAULT_PROTECTED_CONTAINERS[0], values["MONGODB_BACKUP_CONTAINER"])
        self.assertIn("<비밀번호>", values["MONGODB_BACKUP_URI"])
        self.assertEqual(("techcourse-project-2026", "career-form/mongodb-backups"),
                         BACKUP.parse_s3_uri(values["MONGODB_BACKUP_S3_URI"]))

    def test_runbook_schedule_retention_and_objectives_match_units_and_bucket_rule(self):
        text = RUNBOOK.read_text()
        self.assertIn("04,10,16,22", unit(TIMER)["Timer"]["OnCalendar"])
        for phrase in ("매일 04, 10, 16, 22시(Asia/Seoul)", "| 호스트 보관 | 7일", "| 원격 보관 | 30일", "RPO: 최대 6시간",
                       "backup-bucket-policy-statement.json", "backup-lifecycle-rule.json",
                       "CareerFormMongoBackupDenyRead", "career-form-mongodb-backups-expire-30d",
                       "`backup`", "`readAnyDatabase`", "--teardown", "--kernel-compat"):
            self.assertIn(phrase, text)

    def test_runbook_and_fixtures_hold_no_real_secret_or_identifier(self):
        texts = {path.name: path.read_text() for path in (RUNBOOK, ROOT / "infra/tests/mongodb_backup_fakes.py",
                                                         ROOT / "infra/tests/test_mongodb_backup_runtime.py")}
        for name, text in texts.items():
            with self.subTest(file=name):
                self.assertIsNone(re.search(r"(?<![0-9a-f])\d{12}(?![0-9a-f])", text))
                self.assertNotIn("AGE-SECRET-KEY-1", text.replace("AGE-SECRET-KEY-1SYNTHETIC", ""))
                self.assertIsNone(re.search(r"\bage1[02-9ac-hj-np-z]{58}\b", text))
        for uri in re.findall(r"mongodb://\S+", texts["BACKUP.md"]):
            self.assertIn("<비밀번호>", uri)


class MongoDBBackupCatchUpTest(unittest.TestCase):
    def test_catch_up_run_waits_for_container_health_before_dumping(self):
        data = fakes.scenario()
        data["containers"][fakes.CONTAINER]["health_sequence"] = ["starting", "starting", "healthy"]
        workspace = fakes.BackupWorkspace(self, data)
        with mock.patch.object(BACKUP.Backup, "READY_INTERVAL", 0):
            code, output, errors = workspace.run(BACKUP)
        self.assertEqual(0, code, output + errors)
        inspects = [call for call in workspace.calls("docker") if call["args"][0] == "inspect"]
        self.assertEqual(3, len(inspects))

    def test_container_that_never_becomes_healthy_fails_inspect_stage(self):
        data = fakes.scenario()
        data["containers"][fakes.CONTAINER]["health_sequence"] = ["unhealthy"]
        workspace = fakes.BackupWorkspace(self, data)
        with mock.patch.object(BACKUP.Backup, "READY_INTERVAL", 0), mock.patch.object(BACKUP.Backup, "READY_TIMEOUT", 0):
            code, output, errors = workspace.run(BACKUP)
        self.assertEqual(1, code)
        self.assertEqual(1, workspace.metrics()['career_mongo_backup_failure_stage{stage="inspect"}'])
        self.assertEqual([], [call for call in workspace.calls("docker") if "mongodump" in call["args"]])


if __name__ == "__main__":
    unittest.main()
