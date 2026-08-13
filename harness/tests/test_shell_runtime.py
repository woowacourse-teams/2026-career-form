import tempfile
import unittest
from pathlib import Path

from harness.lib.shell_runtime import select_shell


class ShellRuntimeTest(unittest.TestCase):
    def test_selects_git_for_windows_shell_when_available(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            program_files = Path(directory)
            shell = program_files / "Git" / "bin" / "sh.exe"
            shell.parent.mkdir(parents=True)
            shell.touch()

            selected = select_shell(os_name="nt", program_files=program_files)

            self.assertEqual(shell, selected)


if __name__ == "__main__":
    unittest.main()
