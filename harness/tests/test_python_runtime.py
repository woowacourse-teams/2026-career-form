import sys
import tempfile
import unittest
from pathlib import Path

from harness.lib.python_runtime import python_command, select_python


class PythonRuntimeTest(unittest.TestCase):
    def test_ignores_windows_virtual_environment_python(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            python = root / ".venv" / "Scripts" / "python.exe"
            python.parent.mkdir(parents=True)
            python.touch()

            selected = select_python(
                root, fallback="fallback-python", os_name="nt"
            )

            self.assertEqual(Path("fallback-python"), selected)

    def test_selects_posix_virtual_environment_python(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            python = root / ".venv" / "bin" / "python"
            python.parent.mkdir(parents=True)
            python.touch()

            selected = select_python(root, os_name="posix")

            self.assertEqual(python, selected)

    def test_falls_back_to_current_python_when_virtual_environment_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            selected = select_python(root, fallback=sys.executable, os_name="posix")

            self.assertEqual(Path(sys.executable), selected)

    def test_builds_command_with_explicit_python_interpreter(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / "harness" / "scripts" / "doctor.py"

            command = python_command(
                root,
                script,
                "--verbose",
                fallback="fallback-python",
                os_name="posix",
            )

            self.assertEqual(
                ("fallback-python", str(script), "--verbose"),
                command,
            )


if __name__ == "__main__":
    unittest.main()
