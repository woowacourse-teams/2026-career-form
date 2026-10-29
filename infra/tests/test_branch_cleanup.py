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
WORKFLOW = "cleanup-merged-branch.yml"
REPOSITORY = "team/project"
OWNER = "team"
BRANCH = "CF-123"


class WorkBranchCleanupTest(unittest.TestCase):
    def setUp(self) -> None:
        self.env = {
            key: value for key, value in os.environ.items()
            if not key.startswith("GIT_")
        }
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.remote = self.root / "origin.git"
        self.repo = self.root / "checkout"
        self.repo.mkdir()
        self._git("init", "--bare", str(self.remote))
        # Pin the bare remote to its own hooks so a global core.hooksPath on the
        # developer machine cannot shadow the pre-receive hook tests install.
        self._git("--git-dir", str(self.remote), "config", "core.hooksPath",
                  str(self.remote / "hooks"))
        self._git("init", "--initial-branch=develop")
        self._git("config", "user.name", "Test")
        self._git("config", "user.email", "test@example.invalid")
        self._git("config", "core.hooksPath", str(self.root / "no-hooks"))
        self._git("remote", "add", "origin", str(self.remote))
        self._commit("base")
        self._git("push", "origin", "HEAD:refs/heads/develop")
        self.head = self._push_branch(BRANCH, "work")
        self.open_prs = self.root / "open-prs.json"
        self.open_prs.write_text("[]")
        self.env = {**self.env, "GITHUB_REPOSITORY": REPOSITORY}

    def test_work_branch_merge_deletes_head_and_allows_retry(self) -> None:
        for _ in range(2):
            result = self._cleanup(self._event())
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual("complete", result.stdout.strip())
            self.assertEqual("", self._remote_sha(BRANCH))

    def test_work_branch_cleanup_covers_each_allowed_pair(self) -> None:
        cases = (
            ("CF-45", "develop"),
            ("CF-46", "release/1.2.0"),
            ("hotfix/CF-47", "main"),
            ("revert/" + "a" * 40, "main"),
            ("revert/abcdef1", "main"),
        )
        for head, base in cases:
            with self.subTest(head=head, base=base):
                sha = self._push_branch(head, head)
                result = self._cleanup(self._event(ref=head, sha=sha, base=base))
                self.assertEqual(0, result.returncode, result.stderr)
                self.assertEqual("complete", result.stdout.strip())
                self.assertEqual("", self._remote_sha(head))

    def test_work_branch_cleanup_never_deletes_long_lived_or_release_heads(self) -> None:
        for head in ("main", "develop", "release/1.2.0"):
            for base in ("develop", "main", "release/1.2.0"):
                with self.subTest(head=head, base=base):
                    sha = self._push_branch(head, f"{head} {base}")
                    result = self._cleanup(self._event(ref=head, sha=sha, base=base))
                    self.assertEqual(0, result.returncode, result.stderr)
                    self.assertEqual("skipped", result.stdout.strip())
                    self.assertEqual(sha, self._remote_sha(head))

    def test_work_branch_cleanup_skips_disallowed_pairs(self) -> None:
        cases = (
            ("CF-45", "main"),
            ("CF-45", "release/1.2"),
            ("CF-45", "feature"),
            ("hotfix/CF-45", "develop"),
            ("hotfix/CF-45", "release/1.2.0"),
            ("revert/abcdef1", "develop"),
            ("CF-0", "develop"),
            ("CF-012", "develop"),
            ("CF-12a", "develop"),
            ("cf-12", "develop"),
            ("hotfix/CF-", "main"),
            ("revert/abc", "main"),
            ("revert/abcdefg", "main"),
            ("feature/x", "develop"),
        )
        for head, base in cases:
            with self.subTest(head=head, base=base):
                sha = self._push_branch(head, head + base)
                result = self._cleanup(self._event(ref=head, sha=sha, base=base))
                self.assertEqual(0, result.returncode, result.stderr)
                self.assertEqual("skipped", result.stdout.strip())
                self.assertEqual(sha, self._remote_sha(head))

    def test_work_branch_cleanup_skips_non_merge_events(self) -> None:
        for field, value in (
            ("merged", False), ("action", "opened"), ("action", "reopened"),
            ("repository", "outsider/fork"),
        ):
            with self.subTest(field=field, value=value):
                event = self._event()
                pull_request = event["pull_request"]
                if field == "merged":
                    pull_request["merged"] = value
                elif field == "action":
                    event["action"] = value
                else:
                    pull_request["head"]["repo"]["full_name"] = value
                result = self._cleanup(event)
                self.assertEqual(0, result.returncode, result.stderr)
                self.assertEqual("skipped", result.stdout.strip())
                self.assertEqual(self.head, self._remote_sha(BRANCH))

    def test_work_branch_cleanup_skips_when_another_pr_is_open_on_same_head(self) -> None:
        self.open_prs.write_text(json.dumps([
            {"number": 7, "head": {"ref": BRANCH, "repo": {"full_name": REPOSITORY}}},
        ]))
        result = self._cleanup(self._event())
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("skipped", result.stdout.strip())
        self.assertEqual(self.head, self._remote_sha(BRANCH))

    def test_work_branch_cleanup_fails_without_open_pr_list(self) -> None:
        for content in (None, "not json", "{}"):
            with self.subTest(content=content):
                if content is None:
                    self.open_prs.unlink(missing_ok=True)
                else:
                    self.open_prs.write_text(content)
                result = self._cleanup(self._event())
                self.assertNotEqual(0, result.returncode)
                self.assertNotEqual("complete", result.stdout.strip())
                self.assertEqual(self.head, self._remote_sha(BRANCH))

    def test_work_branch_cleanup_requires_open_pr_argument(self) -> None:
        path = self.root / "event.json"
        path.write_text(json.dumps(self._event()))
        result = self._run(GITHUB_EVENT_PATH=str(path), arguments=())
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(self.head, self._remote_sha(BRANCH))

    def test_work_branch_cleanup_preserves_commits_added_after_merge(self) -> None:
        event = self._event()
        newer = self._commit("post merge")
        self._git("push", "--force", "origin", f"HEAD:refs/heads/{BRANCH}")
        result = self._cleanup(event)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("SHA", result.stderr)
        self.assertEqual(newer, self._remote_sha(BRANCH))

    def test_work_branch_cleanup_preserves_commit_added_between_check_and_push(self) -> None:
        newer = self._commit("race")
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
        result = self._cleanup(self._event())
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(newer, self._remote_sha(BRANCH))

    def test_work_branch_cleanup_push_failure_is_not_silenced(self) -> None:
        hook = self.remote / "hooks/pre-receive"
        hook.write_text("#!/bin/sh\nexit 1\n")
        hook.chmod(0o755)
        result = self._cleanup(self._event())
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(self.head, self._remote_sha(BRANCH))

    def test_work_branch_cleanup_remote_access_failure_is_not_treated_as_missing(self) -> None:
        self._git("remote", "set-url", "origin", str(self.root / "inaccessible"))
        result = self._cleanup(self._event())
        self.assertNotEqual(0, result.returncode)
        self.assertNotEqual("complete", result.stdout.strip())

    def test_work_branch_cleanup_invalid_head_sha_is_rejected(self) -> None:
        for sha in ("HEAD", self.head[:7], self.head.upper(), ""):
            with self.subTest(sha=sha):
                result = self._cleanup(self._event(sha=sha))
                self.assertNotEqual(0, result.returncode)
                self.assertEqual(self.head, self._remote_sha(BRANCH))

    def test_release_sync_event_is_left_to_release_cleanup(self) -> None:
        sha = self._push_branch("release/1.0.0", "release")
        result = self._cleanup(self._event(ref="release/1.0.0", sha=sha, base="develop"))
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("skipped", result.stdout.strip())
        self.assertEqual(sha, self._remote_sha("release/1.0.0"))

    def test_workflow_step_reuses_safe_deletion(self) -> None:
        for _ in range(2):
            result = self._workflow_step(self._event())
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual("", self._remote_sha(BRANCH))
        requests = self._gh_requests()
        self.assertEqual(2, len(requests))
        self.assertIn(f"repos/{REPOSITORY}/pulls", requests[0])
        self.assertIn("state=open", requests[0])
        self.assertIn(f"head={OWNER}:{BRANCH}", requests[0])

    def test_workflow_step_keeps_branch_with_open_pr(self) -> None:
        self.open_prs.write_text(json.dumps([{"number": 7}]))
        result = self._workflow_step(self._event())
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(self.head, self._remote_sha(BRANCH))

    def test_workflow_step_fails_when_open_pr_lookup_fails(self) -> None:
        result = self._workflow_step(self._event(), gh_exit=1)
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(self.head, self._remote_sha(BRANCH))

    def _workflow_step(self, event: dict, gh_exit: int = 0) -> subprocess.CompletedProcess:
        workflow = yaml.load(
            (ROOT / ".github/workflows" / WORKFLOW).read_text(), Loader=yaml.BaseLoader,
        )
        step = next(
            step for step in workflow["jobs"]["cleanup"]["steps"] if "run" in step
        )
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
            "record = Path(os.environ['GH_RECORD'])\n"
            "requests = json.loads(record.read_text()) if record.exists() else []\n"
            "requests.append(' '.join(sys.argv[1:]))\n"
            "record.write_text(json.dumps(requests))\n"
            "if sys.argv[1] != 'api':\n"
            "    sys.exit('unexpected gh request: ' + repr(sys.argv[1:]))\n"
            "if int(os.environ['GH_EXIT']):\n"
            "    sys.exit('gh api failure')\n"
            "print(Path(os.environ['OPEN_PRS_RESPONSE']).read_text())\n"
        )
        gh.chmod(0o755)
        event_path = self.root / "event.json"
        event_path.write_text(json.dumps(event))
        environment = {
            key: value.replace("${{ github.event.pull_request.head.ref }}",
                               event["pull_request"]["head"]["ref"])
            for key, value in step.get("env", {}).items()
            if "secrets." not in value
        }
        environment.pop("GH_TOKEN", None)
        runner_temp = self.root / "runner"
        runner_temp.mkdir(exist_ok=True)
        return subprocess.run(
            ["bash", "-e", "-c", step["run"]], cwd=self.repo, text=True,
            capture_output=True,
            env={**self.env, **environment,
                 "PATH": str(binary) + os.pathsep + os.environ["PATH"],
                 "GITHUB_EVENT_PATH": str(event_path),
                 "GITHUB_REPOSITORY_OWNER": OWNER,
                 "RUNNER_TEMP": str(runner_temp),
                 "GH_RECORD": str(self.root / "gh-requests.json"),
                 "GH_EXIT": str(gh_exit),
                 "OPEN_PRS_RESPONSE": str(self.open_prs)},
        )

    def _gh_requests(self) -> list:
        path = self.root / "gh-requests.json"
        return json.loads(path.read_text()) if path.exists() else []

    def _event(self, ref: str = BRANCH, sha: str | None = None,
               base: str = "develop") -> dict:
        return {
            "action": "closed",
            "pull_request": {
                "merged": True,
                "base": {"ref": base},
                "head": {"ref": ref, "sha": self.head if sha is None else sha,
                         "repo": {"full_name": REPOSITORY}},
            },
        }

    def _cleanup(self, event: dict) -> subprocess.CompletedProcess:
        path = self.root / "event.json"
        path.write_text(json.dumps(event))
        return self._run(GITHUB_EVENT_PATH=str(path))

    def _run(self, arguments: tuple[str, ...] | None = None,
             **environment: str) -> subprocess.CompletedProcess:
        if arguments is None:
            arguments = (str(self.open_prs),)
        return subprocess.run(
            [sys.executable, str(SCRIPT), "cleanup-work-branch", *arguments],
            cwd=self.repo, env={**self.env, **environment},
            text=True, capture_output=True,
        )

    def _git(self, *arguments: str) -> str:
        return subprocess.check_output(
            ["git", *arguments], cwd=self.repo, env=self.env,
            text=True, stderr=subprocess.DEVNULL,
        ).strip()

    def _commit(self, message: str) -> str:
        (self.repo / "file.txt").write_text(message)
        self._git("add", "file.txt")
        self._git("commit", "--allow-empty", "-m", message)
        return self._git("rev-parse", "HEAD")

    def _push_branch(self, name: str, message: str) -> str:
        sha = self._commit(message)
        self._git("push", "--force", "origin", f"HEAD:refs/heads/{name}")
        return sha

    def _remote_sha(self, branch: str) -> str:
        value = self._git("ls-remote", "--heads", "origin", f"refs/heads/{branch}")
        for line in value.splitlines():
            sha, name = line.split()
            if name == f"refs/heads/{branch}":
                return sha
        return ""


if __name__ == "__main__":
    unittest.main()
