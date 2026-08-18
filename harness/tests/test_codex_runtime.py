import unittest
from pathlib import Path

from harness.lib.codex_runtime import select_codex


class CodexRuntimeTest(unittest.TestCase):
    def test_selects_codex_from_path(self) -> None:
        executable = Path("codex")

        selected = select_codex(command_lookup=lambda name: str(executable))

        self.assertEqual(executable, selected)

    def test_rejects_codex_wrapper_on_wsl_windows_mount(self) -> None:
        executable = Path("/mnt/c/npm-global/codex")

        with self.assertRaisesRegex(FileNotFoundError, "WSL 내부"):
            select_codex(command_lookup=lambda name: str(executable))


if __name__ == "__main__":
    unittest.main()
