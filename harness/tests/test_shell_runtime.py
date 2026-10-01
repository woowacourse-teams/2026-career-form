import unittest

from harness.lib.shell_runtime import select_shell


class ShellRuntimeTest(unittest.TestCase):
    def test_uses_posix_shell_even_when_windows_arguments_are_supplied(self) -> None:
        selected = select_shell(os_name="nt")

        self.assertEqual("sh", selected)


if __name__ == "__main__":
    unittest.main()
