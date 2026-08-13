import unittest

from harness.lib.shared_files import closing_issue_numbers, validate_shared_file_change


class SharedFilesTest(unittest.TestCase):
    def test_allows_application_change_without_harness_label(self) -> None:
        result = validate_shared_file_change(
            paths=("src/application.py",),
            labels=(),
        )

        self.assertTrue(result.is_valid)

    def test_requires_harness_label_for_shared_file(self) -> None:
        result = validate_shared_file_change(
            paths=("AGENTS.md", "src/application.py"),
            labels=(),
        )

        self.assertIn(
            "공유 하네스 파일 변경에는 harness-change 라벨이 필요합니다",
            result.errors,
        )

    def test_allows_shared_file_with_harness_label(self) -> None:
        result = validate_shared_file_change(
            paths=(".codex/config.toml", "harness/scripts/verify.py"),
            labels=("harness-change",),
            linked_issue_labels=("harness-change",),
        )

        self.assertTrue(result.is_valid)

    def test_requires_linked_harness_issue_for_shared_file(self) -> None:
        result = validate_shared_file_change(
            paths=("harness/scripts/verify.py",),
            labels=("harness-change",),
            linked_issue_labels=("status:in-progress",),
        )

        self.assertIn(
            "공유 하네스 변경은 harness-change Issue에 연결해야 합니다",
            result.errors,
        )

    def test_extracts_closing_issue_numbers(self) -> None:
        numbers = closing_issue_numbers("Closes #12\nFixes #34\n참고 #56")

        self.assertEqual((12, 34), numbers)


if __name__ == "__main__":
    unittest.main()
