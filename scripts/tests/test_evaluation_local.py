import base64
import hashlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))

import evaluation_local  # noqa: E402


def git(root: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)


class CodeVersionTest(unittest.TestCase):
    """커밋 전 백엔드 변경도 실행 조건에서 구분되도록 코드 버전에 변경 지문을 붙인다."""

    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        git(self.root, "init", "-q")
        git(self.root, "config", "user.email", "test@example.test")
        git(self.root, "config", "user.name", "test")
        (self.root / "backend").mkdir()
        (self.root / "backend" / "Service.java").write_text("class Service {}\n", encoding="utf-8")
        (self.root / "README.md").write_text("readme\n", encoding="utf-8")
        git(self.root, "add", ".")
        git(self.root, "commit", "-q", "-m", "init")
        self.head = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=self.root, check=True,
                                   capture_output=True, text=True).stdout.strip()

    def test_clean_backend_is_commit(self) -> None:
        (self.root / "README.md").write_text("changed outside backend\n", encoding="utf-8")
        self.assertEqual(evaluation_local.code_version(self.root), self.head)

    def test_changed_or_new_backend_file_adds_stable_digest(self) -> None:
        (self.root / "backend" / "Service.java").write_text("class Service { int x; }\n", encoding="utf-8")
        first = evaluation_local.code_version(self.root)
        self.assertRegex(first, rf"^{self.head}-dirty-[0-9a-f]{{7}}$")
        self.assertEqual(evaluation_local.code_version(self.root), first)

        (self.root / "backend" / "New.java").write_text("class New {}\n", encoding="utf-8")
        self.assertNotEqual(evaluation_local.code_version(self.root), first)


class PasswordHashTest(unittest.TestCase):
    def test_hash_matches_backend_format(self) -> None:
        value = evaluation_local.hash_password("pw", salt=b"0123456789abcdef")
        algorithm, iterations, salt, digest = value.split("$")
        self.assertEqual(algorithm, "pbkdf2-sha256")
        expected = hashlib.pbkdf2_hmac("sha256", b"pw", base64.b64decode(salt), int(iterations), 32)
        self.assertEqual(base64.b64decode(digest), expected)

    def test_empty_password_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            evaluation_local.hash_password("")


class ComposeEnvironmentTest(unittest.TestCase):
    def test_passes_settings_to_compose_with_defaults(self) -> None:
        environment = evaluation_local.compose_environment(Path("/x/.env.local"), "hash", "abc1234", {})
        self.assertEqual(environment["CF_EVAL_ENV_FILE"], "/x/.env.local")
        self.assertEqual(environment["CF_EVAL_PASSWORD_HASH"], "hash")
        self.assertEqual(environment["CF_EVAL_CODE_VERSION"], "abc1234")
        self.assertEqual(environment["CF_EVAL_PORT"], "18090")

    def test_keeps_overrides(self) -> None:
        environment = evaluation_local.compose_environment(Path("/x/.env.local"), "hash", "v", {"CF_EVAL_PORT": "19000"})
        self.assertEqual(environment["CF_EVAL_PORT"], "19000")


if __name__ == "__main__":
    unittest.main()
