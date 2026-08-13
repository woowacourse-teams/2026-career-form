import tempfile
import unittest
from pathlib import Path

from harness.lib.environment_setup import ensure_environment


class EnvironmentSetupTest(unittest.TestCase):
    def test_skips_bootstrap_when_doctor_succeeds(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_scripts(root, ready=True)

            result = ensure_environment(root)

            self.assertTrue(result.is_ready, result.message)
            self.assertEqual("ready", result.code)
            self.assertFalse((root / ".bootstrap-ran").exists())

    def test_bootstraps_and_rechecks_missing_environment(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_scripts(root, ready=False)

            result = ensure_environment(root)

            self.assertTrue(result.is_ready, result.message)
            self.assertEqual("configured", result.code)
            self.assertTrue((root / ".bootstrap-ran").is_file())
            self.assertEqual("2", (root / ".doctor-count").read_text().strip())

    def test_stops_when_bootstrap_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_scripts(root, ready=False, bootstrap_exit_code=1)

            result = ensure_environment(root)

            self.assertFalse(result.is_ready)
            self.assertEqual("bootstrap_failed", result.code)
            self.assertEqual("1", (root / ".doctor-count").read_text().strip())

    def test_stops_when_environment_is_still_invalid_after_bootstrap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_scripts(root, ready=False, bootstrap_creates_ready=False)

            result = ensure_environment(root)

            self.assertFalse(result.is_ready)
            self.assertEqual("verification_failed", result.code)
            self.assertEqual("2", (root / ".doctor-count").read_text().strip())

    def test_reports_missing_environment_entrypoint(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / "harness" / "scripts"
            scripts.mkdir(parents=True)
            bootstrap = scripts / "bootstrap.py"
            bootstrap.write_text("raise SystemExit(0)\n", encoding="utf-8")

            result = ensure_environment(root)

            self.assertFalse(result.is_ready)
            self.assertEqual("entrypoint_missing", result.code)
            self.assertIn("doctor.py", result.message)

    def test_preserves_bootstrap_failure_detail(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_scripts(root, ready=False)
            bootstrap = root / "harness" / "scripts" / "bootstrap.py"
            bootstrap.write_text("raise SystemExit(9)\n", encoding="utf-8")

            result = ensure_environment(root)

            self.assertFalse(result.is_ready)
            self.assertEqual("bootstrap_failed", result.code)
            self.assertIn(str(bootstrap), result.message)
            self.assertIn("종료 코드 9", result.message)

    def _write_scripts(
        self,
        root: Path,
        *,
        ready: bool,
        bootstrap_exit_code: int = 0,
        bootstrap_creates_ready: bool = True,
    ) -> None:
        scripts = root / "harness" / "scripts"
        scripts.mkdir(parents=True)
        if ready:
            (root / ".ready").touch()

        doctor = scripts / "doctor.py"
        doctor.write_text(
            "from pathlib import Path\n"
            "counter = Path('.doctor-count')\n"
            "count = int(counter.read_text()) if counter.is_file() else 0\n"
            "counter.write_text(str(count + 1))\n"
            "raise SystemExit(0 if Path('.ready').is_file() else 1)\n",
            encoding="utf-8",
        )

        bootstrap = scripts / "bootstrap.py"
        ready_command = "Path('.ready').touch()\n" if bootstrap_creates_ready else ""
        bootstrap.write_text(
            "from pathlib import Path\n"
            "Path('.bootstrap-ran').touch()\n"
            f"{ready_command}"
            f"raise SystemExit({bootstrap_exit_code})\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    unittest.main()
