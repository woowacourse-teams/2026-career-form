import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "infra/scripts/release-sync.py"
BRANCH = "release/1.0.0"
REPOSITORY = "team/project"


class ReleaseSyncTest(unittest.TestCase):
    def setUp(self) -> None:
        local_git_variables = subprocess.check_output(
            ["git", "rev-parse", "--local-env-vars"], text=True,
        ).splitlines()
        self.env = {
            key: value for key, value in os.environ.items()
            if key not in local_git_variables
        }
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.remote = self.root / "origin.git"
        self.repo = self.root / "checkout"
        self.repo.mkdir()
        self._git("init", "--bare", str(self.remote))
        self._git("init", "--initial-branch=develop")
        self._git("config", "user.name", "Test")
        self._git("config", "user.email", "test@example.invalid")
        self._git("config", "core.hooksPath", str(self.root / "no-hooks"))
        self._git("remote", "add", "origin", str(self.remote))
        self.base = self._commit("base")
        self._git("push", "origin", "HEAD:refs/heads/develop")
        self.release = self._commit("release fix")
        self._git("push", "origin", f"HEAD:refs/heads/{BRANCH}")
        self.env = {
            **self.env,
            "RELEASE_BRANCH": BRANCH,
            "RELEASE_SHA": self.release,
            "DEPLOY_RESULT": "success",
            "GITHUB_REPOSITORY": REPOSITORY,
        }

    def test_unmerged_release_requests_pr_and_preserves_branch(self) -> None:
        result = self._run("prepare")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("pr", result.stdout.strip())
        self.assertEqual(self.release, self._remote_sha())

    def test_already_integrated_release_is_deleted_without_pr(self) -> None:
        self._integrate()
        result = self._run("prepare")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("complete", result.stdout.strip())
        self.assertEqual("", self._remote_sha())

    def test_completed_prepare_can_be_retried_after_deletion(self) -> None:
        self._integrate()
        self._git("push", "origin", f":refs/heads/{BRANCH}")
        result = self._run("prepare")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("complete", result.stdout.strip())

    def test_missing_unintegrated_release_fails_with_recovery_guidance(self) -> None:
        self._git("push", "origin", f":refs/heads/{BRANCH}")
        result = self._run("prepare")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("복구", result.stderr)
        self.assertEqual("", self._remote_sha())

    def test_failed_or_missing_deployment_result_never_deletes(self) -> None:
        self._integrate()
        for result in ("failure", "cancelled", "skipped", ""):
            with self.subTest(result=result):
                completed = self._run("prepare", DEPLOY_RESULT=result)
                self.assertNotEqual(0, completed.returncode)
                self.assertEqual(self.release, self._remote_sha())

    def test_changed_release_head_is_preserved(self) -> None:
        self._integrate()
        newer = self._commit("new change")
        self._git("push", "origin", f"HEAD:refs/heads/{BRANCH}")
        result = self._run("prepare")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("SHA", result.stderr)
        self.assertEqual(newer, self._remote_sha())

    def test_remote_access_failure_is_not_treated_as_missing(self) -> None:
        self._integrate()
        self._git("remote", "set-url", "origin", str(self.root / "inaccessible"))
        result = self._run("prepare")
        self.assertNotEqual(0, result.returncode)
        self.assertNotEqual("complete", result.stdout.strip())

    def test_missing_develop_is_not_treated_as_integrated(self) -> None:
        self._git("push", "origin", ":refs/heads/develop")
        result = self._run("prepare")
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(self.release, self._remote_sha())

    def test_merge_event_deletes_release_and_allows_retry(self) -> None:
        self._integrate()
        for _ in range(2):
            result = self._cleanup(self._event())
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual("", self._remote_sha())

    def test_non_sync_events_do_not_delete(self) -> None:
        for field, value in (
            ("merged", False), ("base", "main"),
            ("repository", "outsider/fork"), ("ref", "CF-155"),
            ("action", "opened"),
        ):
            with self.subTest(field=field):
                event = self._event()
                pr = event["pull_request"]
                if field == "merged":
                    pr["merged"] = value
                elif field == "base":
                    pr["base"]["ref"] = value
                elif field == "repository":
                    pr["head"]["repo"]["full_name"] = value
                elif field == "ref":
                    pr["head"]["ref"] = value
                else:
                    event["action"] = value
                result = self._cleanup(event)
                self.assertEqual(0, result.returncode, result.stderr)
                self.assertEqual(self.release, self._remote_sha())

    def test_cleanup_preserves_commits_added_after_pr_merge(self) -> None:
        event = self._event()
        newer = self._commit("post merge")
        self._git("push", "origin", f"HEAD:refs/heads/{BRANCH}")
        result = self._cleanup(event)
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(newer, self._remote_sha())

    def test_invalid_branch_or_sha_is_rejected(self) -> None:
        for key, value in (("RELEASE_BRANCH", "main"), ("RELEASE_SHA", "HEAD")):
            with self.subTest(key=key):
                result = self._run("prepare", **{key: value})
                self.assertNotEqual(0, result.returncode)
                self.assertEqual(self.release, self._remote_sha())

    def test_push_failure_is_not_silenced(self) -> None:
        self._integrate()
        hook = self.remote / "hooks/pre-receive"
        hook.write_text("#!/bin/sh\nexit 1\n")
        hook.chmod(0o755)
        result = self._run("prepare")
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(self.release, self._remote_sha())

    def test_commit_added_between_check_and_push_is_preserved(self) -> None:
        self._integrate()
        newer = self._commit("race")
        # Upload the object without changing the release ref yet.
        self._git("push", "origin", "HEAD:refs/heads/race-object")
        hook_dir = self.root / "race-hooks"
        hook_dir.mkdir()
        hook = hook_dir / "pre-push"
        hook.write_text(
            "#!/bin/sh\n"
            f"git --git-dir='{self.remote}' update-ref refs/heads/{BRANCH} {newer}\n"
        )
        hook.chmod(0o755)
        self._git("config", "core.hooksPath", str(hook_dir))
        result = self._run("prepare")
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(newer, self._remote_sha())

    def test_production_step_skips_pr_and_keeps_tag_when_integrated(self) -> None:
        self._integrate()
        result = self._workflow_step("deploy-production.yml", "release-success")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("", self._remote_sha())
        self.assertEqual([], self._pr_creations())
        self.assertTrue(self._git("ls-remote", "--tags", "origin", "refs/tags/v1.0.0"))

    def test_production_step_creates_pr_once_and_preserves_unmerged_release(self) -> None:
        result = self._workflow_step("deploy-production.yml", "release-success")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(self.release, self._remote_sha())
        created = self._pr_creations()
        self.assertEqual(1, len(created))
        self.assertEqual("develop", created[0][created[0].index("--base") + 1])
        self.assertEqual(BRANCH, created[0][created[0].index("--head") + 1])
        repeated = self._workflow_step("deploy-production.yml", "release-success")
        self.assertEqual(0, repeated.returncode, repeated.stderr)
        self.assertEqual(1, len(self._pr_creations()))

    def test_production_step_does_not_create_pr_when_release_is_missing(self) -> None:
        self._git("push", "origin", f":refs/heads/{BRANCH}")
        result = self._workflow_step("deploy-production.yml", "release-success")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("복구", result.stderr)
        self.assertEqual([], self._pr_creations())

    def test_cleanup_workflow_reuses_safe_deletion(self) -> None:
        path = self.root / "event.json"
        path.write_text(json.dumps(self._event()))
        self.env["GITHUB_EVENT_PATH"] = str(path)
        for _ in range(2):
            result = self._workflow_step("complete-release-sync.yml", "cleanup")
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual("", self._remote_sha())

    def _pr_creations(self) -> list:
        path = self.root / "created.json"
        return json.loads(path.read_text()) if path.exists() else []

    def _workflow_step(self, filename: str, job: str) -> subprocess.CompletedProcess:
        workflow = yaml.load(
            (ROOT / ".github/workflows" / filename).read_text(), Loader=yaml.BaseLoader,
        )
        script = "\n".join(step.get("run", "") for step in workflow["jobs"][job]["steps"])
        link = self.repo / "infra"
        if not link.exists():
            link.symlink_to(ROOT / "infra", target_is_directory=True)
        binary = self.root / "bin"
        binary.mkdir(exist_ok=True)
        gh = binary / "gh"
        gh.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "from pathlib import Path\n"
            "p = Path(os.environ['PR_RECORD'])\n"
            "args = sys.argv[1:]\n"
            "if args[:2] == ['pr', 'list']:\n"
            "    print('42' if p.exists() else '')\n"
            "elif args[:2] == ['pr', 'create']:\n"
            "    records = json.loads(p.read_text()) if p.exists() else []\n"
            "    records.append(args)\n"
            "    p.write_text(json.dumps(records))\n"
            "else:\n"
            "    sys.exit('unexpected gh request: ' + repr(args))\n"
        )
        gh.chmod(0o755)
        return subprocess.run(
            ["bash", "-e", "-c", script], cwd=self.repo, text=True, capture_output=True,
            env={**self.env, "PATH": str(binary) + os.pathsep + os.environ["PATH"],
                 "VERSION": "1.0.0", "GITHUB_SHA": self.release,
                 "RUNNER_TEMP": str(self.root), "PR_RECORD": str(self.root / "created.json")},
        )

    def _event(self) -> dict:
        return {
            "action": "closed",
            "pull_request": {
                "merged": True,
                "base": {"ref": "develop"},
                "head": {"ref": BRANCH, "sha": self.release,
                         "repo": {"full_name": REPOSITORY}},
            },
        }

    def _cleanup(self, event: dict) -> subprocess.CompletedProcess:
        path = self.root / "event.json"
        path.write_text(json.dumps(event))
        return self._run("cleanup", GITHUB_EVENT_PATH=str(path))

    def _run(self, command: str, **environment: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(SCRIPT), command], cwd=self.repo,
            env={**self.env, **environment}, text=True, capture_output=True,
        )

    def _git(self, *arguments: str) -> str:
        return subprocess.check_output(
            ["git", *arguments], cwd=self.repo, env=self.env,
            text=True, stderr=subprocess.DEVNULL,
        ).strip()

    def _commit(self, message: str) -> str:
        (self.repo / "file.txt").write_text(message)
        self._git("add", "file.txt")
        self._git("commit", "-m", message)
        return self._git("rev-parse", "HEAD")

    def _integrate(self) -> None:
        self._git("push", "origin", f"{self.release}:refs/heads/develop")

    def _remote_sha(self) -> str:
        value = self._git("ls-remote", "--heads", "origin", f"refs/heads/{BRANCH}")
        return value.split()[0] if value else ""


class ReleaseSyncEnvironmentTest(unittest.TestCase):
    def test_hook_environment_does_not_change_calling_repository(self) -> None:
        clean_environment = {
            key: value for key, value in os.environ.items()
            if not key.startswith("GIT_")
        }
        with tempfile.TemporaryDirectory() as directory:
            caller = Path(directory) / "caller"
            subprocess.run(
                ["git", "init", str(caller)], env=clean_environment,
                check=True, capture_output=True,
            )
            subprocess.run(
                ["git", "remote", "add", "origin", "https://example.invalid/caller"],
                cwd=caller, env=clean_environment, check=True, capture_output=True,
            )
            config = caller / ".git/config"
            original_config = config.read_bytes()
            result = subprocess.run(
                [
                    sys.executable, "-m", "unittest",
                    "infra.tests.test_release_sync.ReleaseSyncTest."
                    "test_unmerged_release_requests_pr_and_preserves_branch",
                    "infra.tests.test_release_sync.ReleaseSyncTest."
                    "test_production_step_creates_pr_once_and_preserves_unmerged_release",
                ],
                cwd=ROOT, text=True, capture_output=True,
                env={
                    **clean_environment,
                    "GIT_DIR": str(caller / ".git"),
                    "GIT_WORK_TREE": str(caller),
                    "GIT_COMMON_DIR": str(caller / ".git"),
                    "GIT_INDEX_FILE": str(caller / ".git/index"),
                    "GIT_CONFIG_COUNT": "1",
                    "GIT_CONFIG_KEY_0": "user.name",
                    "GIT_CONFIG_VALUE_0": "Calling hook",
                },
            )

            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            self.assertEqual(original_config, config.read_bytes())
            self.assertFalse((caller / ".git/index").exists())
            self.assertEqual([], list((caller / ".git/refs/heads").iterdir()))


if __name__ == "__main__":
    unittest.main()
