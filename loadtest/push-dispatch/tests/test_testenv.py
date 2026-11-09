import base64
import contextlib
import hashlib
import importlib.util
import io
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from pushload import testenv
from pushload.webpush import b64url_decode

ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_env(path):
    """작은따옴표로 감싼 KEY='value' 줄만 읽는다."""
    values = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        name, _, quoted = line.partition("=")
        values[name] = quoted[1:-1]
    return values


def verify_hash(encoded, password):
    scheme, iterations, salt, digest = encoded.split("$")
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(iterations), 32)
    return scheme == "pbkdf2-sha256" and actual == base64.b64decode(digest)


class VapidKeyPairTest(unittest.TestCase):
    def test_matches_backend_vapid_key_format(self):
        public_key, private_key = testenv.vapid_key_pair()
        public_point, private_value = b64url_decode(public_key), b64url_decode(private_key)
        self.assertEqual((65, 4, 32), (len(public_point), public_point[0], len(private_value)))
        derived = ec.derive_private_key(int.from_bytes(private_value, "big"), ec.SECP256R1()).public_key()
        self.assertEqual(public_point, derived.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))

    def test_generates_new_pair_each_time(self):
        self.assertNotEqual(testenv.vapid_key_pair(), testenv.vapid_key_pair())


class PasswordHashTest(unittest.TestCase):
    def test_matches_backend_quality_password_format(self):
        salt = bytes(range(16))
        encoded = testenv.password_hash("pw-123", salt)
        scheme, iterations, salt_text, digest_text = encoded.split("$")
        self.assertEqual(("pbkdf2-sha256", "600000", salt), (scheme, iterations, base64.b64decode(salt_text, validate=True)))
        self.assertEqual(32, len(base64.b64decode(digest_text, validate=True)))
        self.assertTrue(verify_hash(encoded, "pw-123"))
        self.assertFalse(verify_hash(encoded, "pw-124"))

    def test_rejects_values_backend_would_reject(self):
        for password, salt, iterations in (("", bytes(16), 600_000), ("pw", bytes(15), 600_000), ("pw", bytes(65), 600_000),
                                           ("pw", bytes(16), 599_999), ("pw", bytes(16), 2_000_001)):
            with self.subTest(salt=len(salt), iterations=iterations), self.assertRaises(ValueError):
                testenv.password_hash(password, salt, iterations)


class EnvValuesTest(unittest.TestCase):
    def test_contains_all_variables_with_consistent_secrets(self):
        values = testenv.loadtest_env_values()
        self.assertEqual(testenv.ENV_VARIABLES, tuple(values))
        self.assertEqual("mailto:loadtest@example.invalid", values["CAREER_FORM_PUSH_VAPID_SUBJECT"])
        self.assertEqual("mongodb://127.0.0.1:27018/career_form_loadtest", values["LOADTEST_MONGODB_URI"])
        self.assertTrue(verify_hash(values["CAREER_FORM_QUALITY_PASSWORD_HASH"], values["LOADTEST_ADMIN_PASSWORD"]))
        self.assertGreaterEqual(len(values["LOADTEST_ADMIN_PASSWORD"]), 32)

    def test_uses_injected_randomness(self):
        values = testenv.loadtest_env_values(random_bytes=lambda size: b"\x07" * size, token=lambda size: "fixed-password")
        self.assertEqual("fixed-password", values["LOADTEST_ADMIN_PASSWORD"])
        self.assertEqual(testenv.password_hash("fixed-password", b"\x07" * 16), values["CAREER_FORM_QUALITY_PASSWORD_HASH"])


class RenderEnvTest(unittest.TestCase):
    def test_single_quotes_values_and_keeps_dollar_signs(self):
        rendered = testenv.render_env({"HASH": "pbkdf2-sha256$600000$a+b/c==$d", "PLAIN": "x"})
        self.assertIn("HASH='pbkdf2-sha256$600000$a+b/c==$d'\n", rendered)
        self.assertIn("PLAIN='x'\n", rendered)
        self.assertTrue(all(line.startswith("#") for line in rendered.splitlines()[:2]))

    def test_shell_reads_values_literally(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.loadtest"
            path.write_text(testenv.render_env({"HASH": "a$600000$b$c", "LOADTEST_ADMIN_PASSWORD": "p-_q"}))
            shell = subprocess.run(["/bin/sh", "-c", 'set -a; . "$1"; printf "%s|%s" "$HASH" "$LOADTEST_ADMIN_PASSWORD"', "sh", str(path)],
                                   capture_output=True, text=True, check=True)
        self.assertTrue(shell.stdout == "a$600000$b$c|p-_q", "셸이 값을 그대로 읽지 못했습니다")

    def test_rejects_values_that_cannot_be_single_quoted(self):
        for values in ({"A": "it's"}, {"A": "line\nbreak"}, {"a-b": "x"}, {"1A": "x"}):
            with self.subTest(values=list(values)), self.assertRaises(ValueError):
                testenv.render_env(values)


class WriteEnvFileTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / ".env.loadtest"

    def tearDown(self):
        self.directory.cleanup()

    def mode(self):
        return stat.S_IMODE(self.path.stat().st_mode)

    def test_creates_owner_only_file(self):
        testenv.write_env_file(self.path, {"A": "1"})
        self.assertEqual(0o600, self.mode())
        self.assertEqual({"A": "1"}, read_env(self.path))

    def test_refuses_to_overwrite_without_force(self):
        testenv.write_env_file(self.path, {"A": "1"})
        with self.assertRaises(FileExistsError):
            testenv.write_env_file(self.path, {"A": "2"})
        self.assertEqual({"A": "1"}, read_env(self.path))

    def test_force_replaces_file_and_keeps_owner_only_mode(self):
        testenv.write_env_file(self.path, {"A": "1"})
        os.chmod(self.path, 0o644)
        testenv.write_env_file(self.path, {"A": "2"}, force=True)
        self.assertEqual(({"A": "2"}, 0o600), (read_env(self.path), self.mode()))
        self.assertEqual([".env.loadtest"], sorted(item.name for item in Path(self.directory.name).iterdir()))


class MakeTestEnvScriptTest(unittest.TestCase):
    def setUp(self):
        self.script = load_script("make-test-env")
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / ".env.loadtest"

    def tearDown(self):
        self.directory.cleanup()

    def run_script(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = self.script.main(list(argv))
        return code, out.getvalue() + err.getvalue()

    def test_writes_file_and_prints_only_path_and_names(self):
        code, output = self.run_script("--output", str(self.path))
        self.assertEqual(0, code)
        values = read_env(self.path)
        self.assertEqual(testenv.ENV_VARIABLES, tuple(values))
        self.assertEqual(0o600, stat.S_IMODE(self.path.stat().st_mode))
        self.assertIn(str(self.path), output)
        for name, value in values.items():
            self.assertIn(name, output)
            self.assertFalse(value in output, f"{name} 값이 출력에 나왔습니다")

    def test_refuses_existing_file_without_force(self):
        self.path.write_text("KEEP='1'\n")
        code, output = self.run_script("--output", str(self.path))
        self.assertEqual(2, code)
        self.assertIn("--force", output)
        self.assertEqual("KEEP='1'\n", self.path.read_text())

    def test_force_writes_new_values(self):
        self.run_script("--output", str(self.path))
        first = read_env(self.path)
        code, _ = self.run_script("--output", str(self.path), "--force")
        self.assertEqual(0, code)
        self.assertNotEqual(first["LOADTEST_ADMIN_PASSWORD"], read_env(self.path)["LOADTEST_ADMIN_PASSWORD"])

    def test_missing_folder_is_usage_error(self):
        code, output = self.run_script("--output", str(Path(self.directory.name) / "missing" / ".env.loadtest"))
        self.assertEqual(2, code)
        self.assertIn("폴더", output)

    def test_default_output_is_next_to_script(self):
        self.assertEqual(str(ROOT / ".env.loadtest"), self.script.parse_args([]).output)


if __name__ == "__main__":
    unittest.main()
