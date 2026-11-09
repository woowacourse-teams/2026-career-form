import hashlib
import json
import os
import unittest
from unittest import mock

from infra.tests import mongodb_backup_fakes as fakes


BACKUP = fakes.load_script("mongodb-backup.py", "mongodb_backup")
PREVIOUS = {"last_success_run": "20261109T130000Z", "last_success_timestamp": 1000,
            "size_bytes": 10, "target_sizes": {"prod": 4, "dev": 6}}


def dumps(workspace) -> list:
    return [call["args"] for call in workspace.calls("docker")
            if call["args"][0] == "run" and "mongodump" in call["args"] and "--version" not in call["args"]]


class MongoDBBackupScopeTest(unittest.TestCase):
    def test_dumps_whole_prod_and_only_dev_evaluation_collections(self):
        workspace = fakes.BackupWorkspace(self)
        code, output, errors = workspace.run(BACKUP)
        self.assertEqual(0, code, output + errors)
        prod, dev = dumps(workspace)
        self.assertEqual([fakes.PROD], fakes.option(prod, "--db"))
        self.assertEqual([], fakes.option(prod, "--excludeCollection"))
        self.assertEqual([fakes.DEV], fakes.option(dev, "--db"))
        self.assertEqual(sorted(fakes.APP), sorted(fakes.option(dev, "--excludeCollection")))
        self.assertNotIn(fakes.STAGING, json.dumps(workspace.calls()))
        manifest = workspace.manifest()
        self.assertEqual({"prod", "dev"}, set(manifest["targets"]))
        self.assertEqual(sorted(fakes.APP), sorted(manifest["targets"]["prod"]["collections"]))
        self.assertEqual(sorted(fakes.EVALUATION), sorted(manifest["targets"]["dev"]["collections"]))
        self.assertEqual(sorted(fakes.APP), manifest["targets"]["dev"]["excluded_collections"])

    def test_helpers_run_in_running_container_image_and_network_with_mounted_secret_files(self):
        workspace = fakes.BackupWorkspace(self)
        code, output, errors = workspace.run(BACKUP)
        self.assertEqual(0, code, output + errors)
        helpers = [call for call in workspace.calls("docker") if call["args"][0] == "run"]
        self.assertTrue(helpers)
        for call in helpers:
            args = call["args"]
            with self.subTest(args=args):
                self.assertIn("--rm", args)
                self.assertIn(fakes.IMAGE_ID, args)
                if "--version" in args:
                    continue
                self.assertEqual([f"container:{fakes.CONTAINER}"], fakes.option(args, "--network"))
                self.assertNotIn("-p", args)
                mounts = fakes.option(args, "-v")
                self.assertEqual(1, len(mounts))
                self.assertTrue(mounts[0].endswith(":/run/cf-backup:ro"))
                self.assertEqual(0o700, call["mount_modes"]["."])
                self.assertTrue(all(mode == 0o600 for name, mode in call["mount_modes"].items() if name != "."))
        for args in dumps(workspace):
            self.assertEqual(["/run/cf-backup/mongodump.yaml"], fakes.option(args, "--config"))
            self.assertIn("--archive", args)
            self.assertIn("--gzip", args)


class MongoDBBackupFilesTest(unittest.TestCase):
    def test_run_folder_is_private_and_holds_only_encrypted_archives_and_manifest(self):
        workspace = fakes.BackupWorkspace(self)
        code, output, errors = workspace.run(BACKUP)
        self.assertEqual(0, code, output + errors)
        run_dir = workspace.run_dir()
        self.assertEqual(0o700, run_dir.stat().st_mode & 0o777)
        names = sorted(path.name for path in run_dir.iterdir())
        self.assertEqual(["dev.archive.gz.age", "manifest.json", "manifest.json.age", "prod.archive.gz.age"], names)
        for path in run_dir.iterdir():
            with self.subTest(path=path.name):
                self.assertEqual(0o600, path.stat().st_mode & 0o777)
                if path.suffix == ".age":
                    self.assertTrue(path.read_bytes().startswith(b"age-encryption.org/v1\n"))
        for directory in (workspace.root, workspace.state, workspace.runtime):
            for path in directory.rglob("*"):
                if path.is_file():
                    self.assertNotIn(b"FAKE-ARCHIVE", path.read_bytes(), path)
        self.assertEqual([], list(workspace.runtime.iterdir()))

    def test_manifest_records_dump_counts_hashes_and_file_digests(self):
        workspace = fakes.BackupWorkspace(self)
        code, output, errors = workspace.run(BACKUP)
        self.assertEqual(0, code, output + errors)
        manifest = workspace.manifest()
        self.assertEqual(fakes.RUN, manifest["run"])
        self.assertEqual("2026-11-09T19:00:00Z", manifest["started_at"])
        self.assertEqual(fakes.IMAGE, manifest["image"])
        self.assertEqual(fakes.IMAGE_ID, manifest["image_id"])
        self.assertEqual({"mongodump": "100.17.0", "mongosh": "2.9.2"}, manifest["tools"])
        self.assertEqual(f"{fakes.REMOTE}/{fakes.RUN}/", manifest["remote"])
        expected_hashes = fakes.hashes(fakes.APP, "prod")
        prod = manifest["targets"]["prod"]
        self.assertEqual(fakes.PROD, prod["database"])
        for name, count in fakes.APP.items():
            entry = prod["collections"][name]
            self.assertEqual(count, entry["documents"])
            self.assertEqual(expected_hashes[name], entry["hash_before"])
            self.assertEqual(expected_hashes[name], entry["hash_after"])
            self.assertFalse(entry["changed_during_dump"])
        archive = workspace.run_dir() / prod["file"]
        self.assertEqual("prod.archive.gz.age", prod["file"])
        self.assertEqual(archive.stat().st_size, prod["size_bytes"])
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), prod["sha256"])
        self.assertEqual({**fakes.CHECKS, "stable": True}, prod["checks"])
        self.assertNotIn("checks", manifest["targets"]["dev"])
        encrypted = (workspace.run_dir() / "manifest.json.age").read_bytes()
        self.assertEqual(manifest, json.loads(fakes.decrypt(encrypted)))

    def test_collections_and_checks_changed_during_dump_are_marked(self):
        data = fakes.scenario()
        prod = data["databases"][fakes.PROD]
        prod["hashes_after"] = {**prod["hashes"], "job_postings": "changed"}
        prod["checks_after"] = {**prod["checks"], "push_subscriptions": 3}
        workspace = fakes.BackupWorkspace(self, data)
        code, output, errors = workspace.run(BACKUP)
        self.assertEqual(0, code, output + errors)
        collections = workspace.manifest()["targets"]["prod"]["collections"]
        self.assertTrue(collections["job_postings"]["changed_during_dump"])
        self.assertEqual("changed", collections["job_postings"]["hash_after"])
        self.assertFalse(any(entry["changed_during_dump"] for name, entry in collections.items() if name != "job_postings"))
        self.assertFalse(workspace.manifest()["targets"]["prod"]["checks"]["stable"])

    def test_dev_collection_created_after_listing_fails_scope_check(self):
        data = fakes.scenario()
        data["databases"][fakes.DEV]["hidden_from_listing"] = ["job_postings"]
        workspace = fakes.BackupWorkspace(self, data)
        code, output, errors = workspace.run(BACKUP)
        self.assertEqual(1, code)
        self.assertEqual(1, workspace.metrics()['career_mongo_backup_failure_stage{stage="dump"}'])
        self.assertIn("job_postings", output)

    def test_prod_collection_created_after_listing_is_kept_as_changed(self):
        data = fakes.scenario()
        data["databases"][fakes.PROD]["hidden_from_listing"] = ["quality_sessions"]
        workspace = fakes.BackupWorkspace(self, data)
        code, output, errors = workspace.run(BACKUP)
        self.assertEqual(0, code, output + errors)
        entry = workspace.manifest()["targets"]["prod"]["collections"]["quality_sessions"]
        self.assertEqual(1, entry["documents"])
        self.assertTrue(entry["changed_during_dump"])
        self.assertIsNone(entry["hash_before"])


class MongoDBBackupMetricsTest(unittest.TestCase):
    def test_success_metrics_are_written_atomically_and_readable_by_collector(self):
        workspace = fakes.BackupWorkspace(self)
        code, output, errors = workspace.run(BACKUP)
        self.assertEqual(0, code, output + errors)
        metrics = workspace.metrics()
        sizes = {path.name: path.stat().st_size for path in workspace.run_dir().glob("*.age")}
        self.assertEqual(1, metrics["career_mongo_backup_success"])
        self.assertEqual(fakes.NOW, metrics["career_mongo_backup_last_attempt_timestamp_seconds"])
        self.assertEqual(fakes.NOW, metrics["career_mongo_backup_last_success_timestamp_seconds"])
        self.assertEqual(0, metrics["career_mongo_backup_duration_seconds"])
        self.assertEqual(sum(sizes.values()), metrics["career_mongo_backup_size_bytes"])
        self.assertEqual(sizes["prod.archive.gz.age"], metrics['career_mongo_backup_target_size_bytes{target="prod"}'])
        self.assertEqual(sizes["dev.archive.gz.age"], metrics['career_mongo_backup_target_size_bytes{target="dev"}'])
        self.assertFalse(any(name.startswith("career_mongo_backup_failure_stage") for name in metrics))
        prom = workspace.state / "mongodb-backup.prom"
        self.assertEqual(0o644, prom.stat().st_mode & 0o777)
        self.assertEqual(["mongodb-backup-state.json", "mongodb-backup.prom"], sorted(p.name for p in workspace.state.iterdir()))
        state = json.loads((workspace.state / "mongodb-backup-state.json").read_text())
        self.assertEqual(fakes.RUN, state["last_success_run"])
        self.assertEqual(fakes.NOW, state["last_success_timestamp"])

    def test_failures_record_stage_and_keep_previous_success(self):
        cases = (
            ("config", {"env_mode": 0o644}),
            ("config", {"MONGODB_BACKUP_RETENTION_DAYS": "0"}),
            ("inspect", {"fail": "inspect"}),
            ("dump", {"fail": "mongodump"}),
            ("dump", {"fail": "age"}),
        )
        for stage, options in cases:
            with self.subTest(stage=stage, options=options):
                data = fakes.scenario()
                if "fail" in options:
                    data["fail"][options.pop("fail")] = True
                workspace = fakes.BackupWorkspace(self, data, state=PREVIOUS, **options)
                code, output, errors = workspace.run(BACKUP)
                self.assertEqual(1, code)
                metrics = workspace.metrics()
                self.assertEqual(0, metrics["career_mongo_backup_success"])
                self.assertEqual(1, metrics[f'career_mongo_backup_failure_stage{{stage="{stage}"}}'])
                self.assertEqual(1000, metrics["career_mongo_backup_last_success_timestamp_seconds"])
                self.assertEqual(fakes.NOW, metrics["career_mongo_backup_last_attempt_timestamp_seconds"])
                self.assertEqual(10, metrics["career_mongo_backup_size_bytes"])
                self.assertEqual(4, metrics['career_mongo_backup_target_size_bytes{target="prod"}'])
                self.assertIn('"event": "backup_failed"', output)
                if stage == "config":
                    self.assertEqual([], workspace.calls("docker"))
                self.assertEqual([], list(workspace.runtime.iterdir()))

    def test_never_succeeded_reports_zero_last_success(self):
        data = fakes.scenario()
        data["fail"]["mongodump"] = True
        workspace = fakes.BackupWorkspace(self, data)
        code, output, errors = workspace.run(BACKUP)
        self.assertEqual(1, code)
        self.assertEqual(0, workspace.metrics()["career_mongo_backup_last_success_timestamp_seconds"])


class MongoDBBackupSecretTest(unittest.TestCase):
    def test_backup_secret_never_reaches_arguments_environment_logs_metrics_or_manifest(self):
        for failure in (False, True):
            with self.subTest(failure=failure):
                data = fakes.scenario()
                data["leak"] = True
                data["fail"]["mongodump"] = failure
                workspace = fakes.BackupWorkspace(self, data)
                code, output, errors = workspace.run(BACKUP)
                self.assertEqual(1 if failure else 0, code)
                calls = workspace.calls()
                self.assertTrue(calls)
                for call in calls:
                    self.assertNotIn("MONGODB_BACKUP_URI", call["env"])
                texts = [json.dumps([call["args"] for call in calls]), json.dumps([call["env"] for call in calls]),
                         output, errors]
                texts += [path.read_text(errors="replace") for directory in (workspace.root, workspace.state)
                          for path in directory.rglob("*") if path.is_file() and path.suffix != ".age"]
                for text in texts:
                    self.assertNotIn(fakes.PASSWORD, text)
                    self.assertNotIn(fakes.URI, text)
                if failure:
                    self.assertIn("[redacted]", output)

    def test_main_reads_settings_only_from_env_file(self):
        workspace = fakes.BackupWorkspace(self)
        environment = workspace.environment()
        environment["MONGODB_BACKUP_PROD_DATABASE"] = fakes.STAGING
        with mock.patch.dict(os.environ, environment):
            code, output, errors = workspace.run(BACKUP)
        self.assertEqual(0, code, output + errors)
        self.assertNotIn(fakes.STAGING, json.dumps(workspace.calls()))


class MongoDBBackupConfigTest(unittest.TestCase):
    def test_parse_env_handles_comments_quotes_and_equals_signs(self):
        parsed = BACKUP.parse_env("# comment\n\nA=1\nB=\"two words\"\nC='x=y'\nD=mongodb://u:p@h/?authSource=admin\n")
        self.assertEqual({"A": "1", "B": "two words", "C": "x=y", "D": "mongodb://u:p@h/?authSource=admin"}, parsed)

    def test_rejects_invalid_or_conflicting_settings(self):
        cases = (
            {"MONGODB_BACKUP_DEV_DATABASE": fakes.PROD},
            {"MONGODB_BACKUP_PROD_DATABASE": "bad.name"},
            {"MONGODB_BACKUP_RETENTION_DAYS": "0"},
            {"MONGODB_BACKUP_RETENTION_DAYS": "seven"},
            {"MONGODB_BACKUP_S3_URI": "s3://techcourse-project-2026"},
            {"MONGODB_BACKUP_S3_URI": "https://example.invalid/backups"},
            {"MONGODB_BACKUP_S3_REGION": "korea"},
            {"MONGODB_BACKUP_ROOT": "relative/path"},
            {"MONGODB_BACKUP_URI": "postgres://synthetic"},
            {"MONGODB_BACKUP_CONTAINER": "bad name"},
            {"MONGODB_STATE_DIR": None},
        )
        for overrides in cases:
            with self.subTest(overrides=overrides):
                workspace = fakes.BackupWorkspace(self, **overrides)
                with self.assertRaises(BACKUP.BackupError) as raised:
                    BACKUP.load_config(workspace.env)
                self.assertEqual("config", raised.exception.stage)
                self.assertNotIn(fakes.PASSWORD, str(raised.exception))

    def test_rejects_group_or_world_readable_env_file(self):
        workspace = fakes.BackupWorkspace(self, env_mode=0o640)
        with self.assertRaises(BACKUP.BackupError) as raised:
            BACKUP.load_config(workspace.env)
        self.assertIn("600", str(raised.exception))

    def test_dump_report_parser_reads_singular_and_plural_counts_for_one_database(self):
        report = ("2026-11-09T19:00:00.000+0000\twriting `db.a` to `archive on stdout`\n"
                  "2026-11-09T19:00:00.000+0000\tdone dumping `db.a` (1 document)\n"
                  "2026-11-09T19:00:00.000+0000\tdone dumping `db.b.c` (12 documents)\n"
                  "2026-11-09T19:00:00.000+0000\tdone dumping `other.x` (3 documents)\n")
        self.assertEqual({"a": 1, "b.c": 12}, BACKUP.parse_dump_report(report, "db"))

    def test_run_name_is_utc_timestamp(self):
        self.assertEqual(fakes.RUN, BACKUP.run_name(fakes.NOW))
        self.assertRegex(fakes.RUN, r"^\d{8}T\d{6}Z$")


if __name__ == "__main__":
    unittest.main()
