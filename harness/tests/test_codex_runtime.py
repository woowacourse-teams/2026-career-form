import unittest
from pathlib import Path

from harness.lib.codex_runtime import select_codex


class CodexRuntimeTest(unittest.TestCase):
    def test_selects_windows_command_wrapper(self) -> None:
        executable = Path("D:/npm-global/codex.cmd")

        selected = select_codex(command_lookup=lambda name: str(executable))

        self.assertEqual(executable, selected)


if __name__ == "__main__":
    unittest.main()
