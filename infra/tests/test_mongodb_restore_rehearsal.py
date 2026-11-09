import contextlib
import io
import itertools
import json
import os
import time
import unittest
from pathlib import Path
from unittest import mock

from infra.tests import mongodb_backup_fakes as fakes


BACKUP = fakes.load_script("mongodb-backup.py", "mongodb_backup_for_rehearsal")
REHEARSAL = fakes.load_script("mongodb-restore-rehearsal.py", "mongodb_restore_rehearsal")
PROTECTED_CONTAINER = "career-form-mongodb-mongodb-1"
STAGES = ["fetch", "start", "restore", "verify"]


class Rehearsal:
    """가짜 도구로 백업 실행 폴더를 하나 만든 뒤 복구 리허설을 돌리는 작업 공간."""

    def __init__(self, testcase, data: dict = None):
        self.testcase = testcase
        self.backup = fakes.BackupWorkspace(testcase, data)
        code, output, errors = self.backup.run(BACKUP)
        testcase.assertEqual(0, code, output + errors)
        self.identity = self.backup.base / "identity.txt"
        self.identity.write_text("AGE-SECRET-KEY-1SYNTHETIC0IDENTITY\n")
        self.identity.chmod(0o600)
        self.protected = self.backup.base / "prod-data"
        self.protected.mkdir()
        self.work = self.backup.base / "rehearsal"

    def argv(self, *extra, source=None, work=None) -> list:
        return ["--source", str(source or self.backup.run_dir()), "--identity", str(self.identity),
                "--work-dir", str(work or self.work), "--protected-path", str(self.protected),
                "--protected-container", PROTECTED_CONTAINER, *extra]

    def run(self, argv: list, clock=time.time):
        output, errors = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, self.backup.environment()), contextlib.redirect_stdout(output), \
                contextlib.redirect_stderr(errors):
            code = REHEARSAL.main(argv, clock=clock)
        return code, output.getvalue(), errors.getvalue()

    def report(self) -> dict:
        return json.loads((self.work / "report.json").read_text())

    def docker(self) -> list:
        return [call["args"] for call in self.backup.calls("docker")]

    def started(self) -> list:
        return [args for args in self.docker() if args[:2] == ["run", "-d"]]

    def override(self, database: str, **values) -> None:
        fakes.update(self.backup.bin, lambda data: data.setdefault("restored_override", {}).update({database: values}))


def checks(report: dict, result: str) -> list:
    return [(item["target"], item["check"]) for item in report["checks"] if item["result"] == result]


class MongoDBRestoreRehearsalTest(unittest.TestCase):
    def test_restores_into_networkless_temporary_container_and_passes_all_checks(self):
        rehearsal = Rehearsal(self)
        code, output, errors = rehearsal.run(rehearsal.argv())
        self.assertEqual(0, code, output + errors)
        report = rehearsal.report()
        self.assertEqual("success", report["result"])
        self.assertEqual(fakes.RUN, report["run"])
        self.assertEqual([], checks(report, "fail"))
        self.assertIn(("prod", "count job_postings"), checks(report, "pass"))
        self.assertIn(("dev", "dbHash evaluation_runs"), checks(report, "pass"))
        self.assertIn(("prod", "active policy versions"), checks(report, "pass"))
        self.assertIn(("prod", "push_subscriptions"), checks(report, "pass"))
        self.assertIn(("prod", "permanent quality records"), checks(report, "pass"))
        [start] = rehearsal.started()
        name = fakes.option(start, "--name")[0]
        self.assertEqual(["none"], fakes.option(start, "--network"))
        self.assertEqual(["512m"], fakes.option(start, "--memory"))
        self.assertEqual([f"career-form.rehearsal={report['id']}"], fakes.option(start, "--label"))
        self.assertEqual([f"{rehearsal.work / 'data'}:/data/db"], fakes.option(start, "-v"))
        self.assertEqual(fakes.IMAGE, start[start.index("mongod") - 1])
        self.assertIn("ttlMonitorEnabled=false", start)
        self.assertEqual(["0.25"], fakes.option(start, "--wiredTigerCacheSizeGB"))
        self.assertEqual([], fakes.option(start, "-e"))
        for args in rehearsal.docker():
            self.assertNotIn("-p", args)
            self.assertNotIn("--publish", args)
            self.assertNotIn("--drop", args)
            if args[0] == "exec":
                self.assertIn(name, args)
                self.assertNotIn(fakes.CONTAINER, args)
        self.assertEqual(0o600, (rehearsal.work / "report.json").stat().st_mode & 0o777)
        self.assertEqual(0o700, rehearsal.work.stat().st_mode & 0o777)

    def test_reports_each_stage_time_in_table_and_json(self):
        rehearsal = Rehearsal(self)
        ticks = itertools.count(fakes.NOW, 2)
        code, output, errors = rehearsal.run(rehearsal.argv(), clock=lambda: next(ticks))
        self.assertEqual(0, code, output + errors)
        report = rehearsal.report()
        self.assertEqual(STAGES, [stage["name"] for stage in report["stages"]])
        for stage in report["stages"]:
            self.assertRegex(stage["started_at"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
            self.assertRegex(stage["finished_at"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
            self.assertEqual(2, stage["seconds"])
            self.assertEqual("pass", stage["result"])
        self.assertEqual(8, report["total_seconds"])
        for name in STAGES + ["합계"]:
            self.assertIn(name, output)
        self.assertEqual(report, json.loads(output[output.index("{"):]))

    def test_checksum_mismatch_fails_fetch_before_starting_any_container(self):
        rehearsal = Rehearsal(self)
        archive = rehearsal.backup.run_dir() / "prod.archive.gz.age"
        archive.write_bytes(archive.read_bytes() + b"tampered")
        code, output, errors = rehearsal.run(rehearsal.argv())
        self.assertEqual(1, code)
        report = rehearsal.report()
        self.assertEqual("failure", report["result"])
        self.assertEqual("fetch", report["failed_stage"])
        self.assertIn(("prod", "sha256"), checks(report, "fail"))
        self.assertEqual([], rehearsal.started())

    def test_count_hash_or_extra_collection_mismatch_fails_verification(self):
        rehearsal = Rehearsal(self)
        rehearsal.override(fakes.PROD, collections={"job_postings": 3, "stray": 1},
                           hashes={"push_deliveries": "different"})
        code, output, errors = rehearsal.run(rehearsal.argv())
        self.assertEqual(1, code)
        failed = checks(rehearsal.report(), "fail")
        self.assertIn(("prod", "count job_postings"), failed)
        self.assertIn(("prod", "dbHash push_deliveries"), failed)
        self.assertIn(("prod", "unexpected collections"), failed)
        self.assertEqual("verify", rehearsal.report()["failed_stage"])

    def test_collections_changed_during_dump_skip_hash_but_keep_count(self):
        data = fakes.scenario()
        prod = data["databases"][fakes.PROD]
        prod["hashes_after"] = {**prod["hashes"], "job_postings": "changed"}
        rehearsal = Rehearsal(self, data)
        code, output, errors = rehearsal.run(rehearsal.argv())
        self.assertEqual(0, code, output + errors)
        report = rehearsal.report()
        self.assertIn(("prod", "dbHash job_postings"), checks(report, "skip"))
        self.assertIn(("prod", "count job_postings"), checks(report, "pass"))

    def test_prod_policy_subscription_and_quality_checks_must_match(self):
        rehearsal = Rehearsal(self)
        rehearsal.override(fakes.PROD, checks={
            "active_policies": [{"companyKey": "synthetic-a", "activePolicyVersion": 3, "policyExists": False},
                                {"companyKey": "synthetic-b", "activePolicyVersion": 8, "policyExists": True}],
            "push_subscriptions": 1, "permanent_quality_records": 2})
        code, output, errors = rehearsal.run(rehearsal.argv())
        self.assertEqual(1, code)
        failed = checks(rehearsal.report(), "fail")
        for name in ("active policy versions", "active policy documents", "push_subscriptions",
                     "permanent quality records"):
            self.assertIn(("prod", name), failed)

    def test_unstable_prod_checks_are_skipped_but_policy_documents_are_still_required(self):
        data = fakes.scenario()
        prod = data["databases"][fakes.PROD]
        prod["checks_after"] = {**prod["checks"], "push_subscriptions": 9}
        rehearsal = Rehearsal(self, data)
        code, output, errors = rehearsal.run(rehearsal.argv())
        self.assertEqual(0, code, output + errors)
        report = rehearsal.report()
        self.assertIn(("prod", "push_subscriptions"), checks(report, "skip"))
        self.assertIn(("prod", "active policy documents"), checks(report, "pass"))

    def test_restores_from_remote_location_after_download(self):
        rehearsal = Rehearsal(self)
        source = f"{fakes.REMOTE}/{fakes.RUN}/"
        code, output, errors = rehearsal.run(rehearsal.argv(source=source))
        self.assertEqual(0, code, output + errors)
        [download] = [call["args"] for call in rehearsal.backup.calls("aws") if "--recursive" in call["args"]]
        self.assertEqual(["s3", "cp", source, str(rehearsal.work / "download")], download[:4])
        self.assertEqual(["ap-northeast-2"], fakes.option(download, "--region"))
        self.assertEqual("success", rehearsal.report()["result"])

    def test_unexpected_file_error_is_reported_as_failed_stage_with_report(self):
        rehearsal = Rehearsal(self)
        with mock.patch.object(REHEARSAL, "sha256", side_effect=PermissionError(13, "Permission denied")):
            code, output, errors = rehearsal.run(rehearsal.argv())
        self.assertEqual(1, code)
        report = rehearsal.report()
        self.assertEqual("fetch", report["failed_stage"])
        self.assertIn("Permission denied", report["error"])
        self.assertEqual([], rehearsal.started())

    def test_missing_docker_before_start_is_an_error_not_a_traceback(self):
        rehearsal = Rehearsal(self)
        (rehearsal.backup.bin / "docker").unlink()
        rehearsal.backup.environment = lambda: {"PATH": str(rehearsal.backup.bin),
                                                "RUNTIME_DIRECTORY": str(rehearsal.backup.runtime)}
        code, output, errors = rehearsal.run(rehearsal.argv())
        self.assertEqual(1, code)
        self.assertIn("docker command is not installed", errors)
        self.assertFalse(rehearsal.work.exists())

    def test_kernel_compat_sets_glibc_rseq_tunable_only_when_requested(self):
        rehearsal = Rehearsal(self)
        code, output, errors = rehearsal.run(rehearsal.argv("--kernel-compat"))
        self.assertEqual(0, code, output + errors)
        [start] = rehearsal.started()
        self.assertEqual(["GLIBC_TUNABLES=glibc.pthread.rseq=1"], fakes.option(start, "-e"))


class MongoDBRestoreRehearsalGuardTest(unittest.TestCase):
    def assert_refused(self, rehearsal, argv, created=None):
        code, output, errors = rehearsal.run(argv)
        self.assertEqual(2, code, output + errors)
        self.assertIn("refused", errors)
        self.assertEqual([], rehearsal.started())
        if created is not None:
            self.assertFalse(created.exists())

    def test_refuses_operational_paths_containers_and_folders_it_did_not_create(self):
        rehearsal = Rehearsal(self)
        busy = rehearsal.backup.base / "busy"
        busy.mkdir()
        (busy / "keep.txt").write_text("not ours")
        cases = (
            ("protected path", rehearsal.argv(work=rehearsal.protected)),
            ("inside protected path", rehearsal.argv(work=rehearsal.protected / "rehearsal")),
            ("ancestor of protected path", rehearsal.argv(work=rehearsal.backup.base)),
            ("non-empty folder", rehearsal.argv(work=busy)),
            ("inside source", rehearsal.argv(work=rehearsal.backup.run_dir() / "rehearsal")),
            ("operational container", rehearsal.argv("--name", PROTECTED_CONTAINER)),
            ("existing container", rehearsal.argv("--name", fakes.CONTAINER)),
            ("source in protected path", rehearsal.argv(source=rehearsal.protected)),
        )
        for reason, argv in cases:
            with self.subTest(reason=reason):
                self.assert_refused(rehearsal, argv)
        self.assertTrue((busy / "keep.txt").exists())
        self.assertEqual([], list(rehearsal.protected.iterdir()))

    def test_default_protection_covers_operational_data_folder_and_container(self):
        self.assertIn(Path("/var/lib/career-form/mongodb"), REHEARSAL.DEFAULT_PROTECTED_PATHS)
        self.assertIn(PROTECTED_CONTAINER, REHEARSAL.DEFAULT_PROTECTED_CONTAINERS)

    def test_source_has_no_operational_write_or_network_path(self):
        source = (fakes.ROOT / "infra/scripts/mongodb-restore-rehearsal.py").read_text()
        for token in ('"--drop"', '"-p"', '"--publish"', "27017:", '"host"'):
            self.assertNotIn(token, source)

    def test_teardown_removes_only_its_own_container_and_folder(self):
        rehearsal = Rehearsal(self)
        code, output, errors = rehearsal.run(rehearsal.argv())
        self.assertEqual(0, code, output + errors)
        name = fakes.option(rehearsal.started()[0], "--name")[0]
        code, output, errors = rehearsal.run(["--teardown", "--work-dir", str(rehearsal.work),
                                             "--protected-path", str(rehearsal.protected)])
        self.assertEqual(0, code, output + errors)
        self.assertFalse(rehearsal.work.exists())
        self.assertIn(["rm", "-f", name], rehearsal.docker())
        self.assertNotIn(["rm", "-f", fakes.CONTAINER], rehearsal.docker())

    def test_teardown_refuses_unmarked_folder_foreign_label_and_operational_container(self):
        rehearsal = Rehearsal(self)
        unmarked = rehearsal.backup.base / "unmarked"
        unmarked.mkdir()
        code, output, errors = rehearsal.run(["--teardown", "--work-dir", str(unmarked)])
        self.assertEqual(2, code)
        self.assertTrue(unmarked.exists())
        for container in (fakes.CONTAINER, PROTECTED_CONTAINER):
            with self.subTest(container=container):
                forged = rehearsal.backup.base / f"forged-{container}"
                forged.mkdir(mode=0o700)
                (forged / ".career-form-rehearsal.json").write_text(json.dumps({"id": "abc", "container": container}))
                code, output, errors = rehearsal.run(["--teardown", "--work-dir", str(forged)])
                self.assertEqual(2, code, output + errors)
                self.assertTrue(forged.exists())
                self.assertNotIn(["rm", "-f", container], rehearsal.docker())

    def test_teardown_refuses_protected_location_even_with_marker(self):
        rehearsal = Rehearsal(self)
        (rehearsal.protected / ".career-form-rehearsal.json").write_text(json.dumps({"id": "abc", "container": "x"}))
        code, output, errors = rehearsal.run(["--teardown", "--work-dir", str(rehearsal.protected),
                                             "--protected-path", str(rehearsal.protected)])
        self.assertEqual(2, code)
        self.assertTrue(rehearsal.protected.exists())


class MongoDBRestoreCompareTest(unittest.TestCase):
    def test_compare_target_reports_pass_fail_and_skip_per_check(self):
        expected = {"collections": {
            "a": {"documents": 2, "hash_before": "h1", "hash_after": "h1", "changed_during_dump": False},
            "b": {"documents": 1, "hash_before": "h2", "hash_after": "h3", "changed_during_dump": True}}}
        observed = {"counts": {"a": 2, "b": 1}, "hashes": {"a": "h1", "b": "h9"}, "checks": None}
        results = {(item["check"], item["result"]) for item in REHEARSAL.compare_target("dev", expected, observed)}
        self.assertEqual({("count a", "pass"), ("count b", "pass"), ("unexpected collections", "pass"),
                          ("dbHash a", "pass"), ("dbHash b", "skip")}, results)


if __name__ == "__main__":
    unittest.main()
