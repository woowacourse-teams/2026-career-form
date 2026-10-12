import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from harness.lib.raw_immutability import LOCAL_GIT_ENVIRONMENT, validate_raw_immutability


ROOT = Path(__file__).resolve().parents[2]


class VerificationBaseTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.environment = {
            key: value for key, value in os.environ.items()
            if key not in LOCAL_GIT_ENVIRONMENT and not key.startswith("GITHUB_")
        }
        self.git("init", "-q", "-b", "develop")
        self.git("config", "user.name", "Harness Test")
        self.git("config", "user.email", "harness@example.test")
        self.raw = self.root / "llm-wiki/raw/shared.md"
        self.raw.parent.mkdir(parents=True)
        self.raw.write_text("shared baseline\n")
        self.git("add", ".")
        self.git("commit", "-qm", "baseline")
        self.git("branch", "release/1.2.0")
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")
        self.git("update-ref", "refs/remotes/origin/release/1.2.0", "HEAD")
        (self.raw.parent / "develop-only.md").write_text("develop knowledge\n")
        self.git("add", ".")
        self.git("commit", "-qm", "develop knowledge")
        self.git("update-ref", "refs/remotes/origin/develop", "HEAD")
        self.git("switch", "-qc", "CF-185", "release/1.2.0")

    def git(self, *arguments: str) -> str:
        return subprocess.check_output(
            ("git", *arguments), cwd=self.root, env=self.environment, text=True,
            stderr=subprocess.PIPE,
        ).strip()

    def verify(self, *arguments: str) -> int:
        spec = importlib.util.spec_from_file_location(
            "verification_entrypoint", ROOT / "harness/scripts/verify.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        def execute(command: tuple[str, ...]) -> int:
            if any(Path(part).name == "validate-llm-wiki.py" for part in command):
                return int(bool(validate_raw_immutability(self.root, command[-1])))
            return 0

        with (
            patch.object(module, "ROOT", self.root),
            patch.object(module, "run", side_effect=execute),
            patch.object(sys, "argv", ["verify.py", *arguments]),
            patch.dict(os.environ, self.environment, clear=True),
        ):
            try:
                return module.main()
            except SystemExit as error:
                return int(error.code)

    def test_release_cli_ignores_raw_added_only_to_develop(self) -> None:
        self.assertEqual(0, self.verify("--base-ref", "origin/release/1.2.0"))

    def test_local_branch_metadata_is_used_without_cli(self) -> None:
        self.git("config", "branch.CF-185.career-form-base", "origin/release/1.2.0")
        self.assertEqual(0, self.verify())

    def test_pr_base_is_used_on_detached_checkout(self) -> None:
        self.git("switch", "--detach", "-q")
        self.environment["GITHUB_BASE_REF"] = "release/1.2.0"
        self.assertEqual(0, self.verify())

    def test_develop_default_still_protects_existing_raw(self) -> None:
        self.git("switch", "-q", "develop")
        self.assertEqual(0, self.verify())
        self.raw.write_text("changed\n")
        self.assertEqual(1, self.verify())

    def test_main_push_metadata_is_used_on_detached_checkout(self) -> None:
        self.git("switch", "--detach", "-q")
        self.environment.update(GITHUB_EVENT_NAME="push", GITHUB_REF_NAME="main")
        self.assertEqual(0, self.verify())

    def test_release_existing_raw_changes_are_rejected(self) -> None:
        for operation in ("modify", "delete", "rename"):
            with self.subTest(operation=operation):
                self.raw.write_text("shared baseline\n")
                if operation == "modify":
                    self.raw.write_text("changed\n")
                elif operation == "delete":
                    self.raw.unlink()
                else:
                    self.raw.rename(self.raw.with_name("renamed.md"))
                self.assertEqual(1, self.verify("--base-ref", "origin/release/1.2.0"))

    def test_invalid_or_missing_ref_fails_before_running_checks(self) -> None:
        for base in ("origin/release/9.9.9", "HEAD", "--help", "origin/develop~1"):
            with self.subTest(base=base):
                self.assertEqual(2, self.verify("--base-ref", base))

    def test_unknown_work_branch_requires_explicit_base(self) -> None:
        self.assertEqual(2, self.verify())

    def test_conflicting_declared_bases_are_rejected(self) -> None:
        self.git("config", "branch.CF-185.career-form-base", "origin/develop")
        self.assertEqual(2, self.verify("--base-ref", "origin/release/1.2.0"))

    def test_pr_base_cannot_be_overridden_by_cli(self) -> None:
        self.environment["GITHUB_BASE_REF"] = "develop"
        self.assertEqual(2, self.verify("--base-ref", "origin/release/1.2.0"))

    def test_work_branch_cannot_select_main_as_base(self) -> None:
        self.assertEqual(2, self.verify("--base-ref", "origin/main"))

    def test_hotfix_defaults_to_main(self) -> None:
        self.git("switch", "-qc", "hotfix/CF-185")
        self.assertEqual(0, self.verify())

    def test_pr_without_base_does_not_guess_from_checkout(self) -> None:
        self.git("switch", "-q", "develop")
        self.environment["GITHUB_EVENT_NAME"] = "pull_request"
        self.assertEqual(2, self.verify())

    def test_pre_push_uses_branch_base_and_blocks_existing_raw_change(self) -> None:
        hooks = self.root / ".githooks"
        hooks.mkdir()
        for name in ("pre-push", "python-runtime.sh"):
            shutil.copyfile(ROOT / ".githooks" / name, hooks / name)
        (hooks / "pre-push").chmod(0o755)
        self.git("config", "core.hooksPath", ".githooks")
        self.git("config", "branch.CF-185.career-form-base", "origin/release/1.2.0")
        library = self.root / "harness/lib"
        library.mkdir(parents=True)
        for name in ("verification_base.py", "raw_immutability.py", "branching.py", "result.py"):
            shutil.copyfile(ROOT / "harness/lib" / name, library / name)
        scripts = self.root / "harness/scripts"
        scripts.mkdir()
        (scripts / "verify.py").write_text(
            "import sys\nfrom pathlib import Path\n"
            "root = Path(__file__).resolve().parents[2]\n"
            "sys.path.insert(0, str(root))\n"
            "from harness.lib.verification_base import resolve_verification_base\n"
            "from harness.lib.raw_immutability import validate_raw_immutability\n"
            "sys.exit(bool(validate_raw_immutability(root, resolve_verification_base(root))))\n"
        )
        with tempfile.TemporaryDirectory() as destination:
            subprocess.run(
                ("git", "init", "--bare", "-q", destination),
                env=self.environment, check=True,
            )
            self.git("remote", "add", "test", destination)
            self.git("push", "test", "CF-185")
            before = subprocess.check_output(
                ("git", "--git-dir", destination, "rev-parse", "refs/heads/CF-185"),
                env=self.environment, text=True,
            )
            self.raw.write_text("changed\n")
            self.git("add", "llm-wiki")
            self.git("commit", "-qm", "illegal raw change")
            refused = subprocess.run(
                ("git", "push", "test", "CF-185"), cwd=self.root,
                env=self.environment, capture_output=True, text=True, check=False,
            )
            self.assertNotEqual(0, refused.returncode)
            after = subprocess.check_output(
                ("git", "--git-dir", destination, "rev-parse", "refs/heads/CF-185"),
                env=self.environment, text=True,
            )
            self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
