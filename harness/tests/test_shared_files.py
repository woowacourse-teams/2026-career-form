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

    def test_allows_valid_system_pr_without_harness_issue(self) -> None:
        for head, base in (
            ("release/1.2.0", "main"), ("release/1.2.0", "develop"),
            ("main", "develop"), ("main", "release/1.2.0"),
            ("revert/abcdef1", "main"),
        ):
            with self.subTest(head=head, base=base):
                result = validate_shared_file_change(
                    ("harness/scripts/verify.py",), (), head=head, base=base,
                )
                self.assertTrue(result.is_valid, result.errors)

    def test_preserves_harness_protection_for_work_and_hotfix(self) -> None:
        for head, base in (
            ("CF-197", "release/1.2.0"), ("CF-197", "develop"),
            ("hotfix/CF-197", "main"),
        ):
            with self.subTest(head=head, base=base):
                self.assertFalse(validate_shared_file_change(
                    ("harness/test.py",), (), head=head, base=base,
                ).is_valid)
                self.assertTrue(validate_shared_file_change(
                    ("harness/test.py",), ("harness-change",), ("harness-change",),
                    head=head, base=base,
                ).is_valid)

    def test_rejects_invalid_branch_flow_even_with_harness_labels(self) -> None:
        for head, base in (
            ("release/fake", "main"), ("release/1.2.0", "CF-197"),
            ("develop", "main"), ("main", "main"), ("", "main"),
            ("release/1.2.0", ""),
        ):
            with self.subTest(head=head, base=base):
                self.assertFalse(validate_shared_file_change(
                    ("harness/test.py",), ("harness-change",), ("harness-change",),
                    head=head, base=base,
                ).is_valid)

    def test_extracts_closing_issue_numbers(self) -> None:
        numbers = closing_issue_numbers("Closes #12\nFixes #34\n참고 #56")

        self.assertEqual((12, 34), numbers)


if __name__ == "__main__":
    unittest.main()
