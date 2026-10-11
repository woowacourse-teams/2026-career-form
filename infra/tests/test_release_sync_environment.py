import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from infra.tests import test_release_sync as fixtures


class ReleaseSyncEnvironmentTest(unittest.TestCase):
    def test_hook_git_environment_cannot_redirect_fixture_into_parent_repository(self):
        environment = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        with tempfile.TemporaryDirectory(prefix="release-sync-parent-") as directory:
            parent = Path(directory)
            def git(*arguments):
                return subprocess.check_output(("git", *arguments), cwd=parent, env=environment,
                    text=True, stderr=subprocess.DEVNULL).strip()
            git("init", "--initial-branch=parent")
            git("config", "core.hooksPath", "keep-parent-hooks")
            git("remote", "add", "origin", "https://synthetic.invalid/parent.git")
            polluted = {"GIT_DIR": str(parent / ".git"), "GIT_WORK_TREE": str(parent),
                "GIT_COMMON_DIR": str(parent / ".git"), "GIT_INDEX_FILE": str(parent / ".git/index"), "GIT_PREFIX": "parent/"}
            fixture = fixtures.ReleaseSyncTest("test_unmerged_release_requests_pr_and_preserves_branch")
            try:
                with patch.dict(os.environ, polluted):
                    try:
                        fixture.setUp()
                    except subprocess.CalledProcessError:
                        self.fail("Fixture Git inherited the hook repository instead of using its temporary checkout")
                    self.assertTrue((fixture.repo / ".git").is_dir())
                    self.assertFalse(any(key.startswith("GIT_") for key in fixture.env))
                    fixture.test_unmerged_release_requests_pr_and_preserves_branch()
                self.assertEqual("keep-parent-hooks", git("config", "core.hooksPath"))
                self.assertEqual("https://synthetic.invalid/parent.git", git("remote", "get-url", "origin"))
                self.assertEqual("parent", git("branch", "--show-current"))
            finally:
                fixture.doCleanups()
