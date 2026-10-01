import unittest

from harness.lib.branching import validate_branch_flow


class BranchingTest(unittest.TestCase):
    def test_accepts_issue_branch_to_develop(self) -> None:
        result = validate_branch_flow("CF-123", "develop")

        self.assertTrue(result.is_valid)

    def test_accepts_hotfix_issue_branch_to_main(self) -> None:
        result = validate_branch_flow("hotfix/CF-321", "main")

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_regular_issue_branch_to_main(self) -> None:
        result = validate_branch_flow("CF-321", "main")

        self.assertIn(
            "일반 작업 브랜치는 main으로 병합할 수 없습니다",
            result.errors,
        )

    def test_rejects_hotfix_issue_branch_to_non_main_target(self) -> None:
        for base in ("develop", "release/1.0.0"):
            with self.subTest(base=base):
                result = validate_branch_flow("hotfix/CF-321", base)

                self.assertIn(
                    "hotfix 브랜치는 main으로만 병합합니다",
                    result.errors,
                )

    def test_rejects_invalid_hotfix_issue_branch(self) -> None:
        for branch in ("hotfix/321", "hotfix/CF-0", "hotfix/cf-321"):
            with self.subTest(branch=branch):
                result = validate_branch_flow(branch, "main")

                self.assertIn(
                    "hotfix 브랜치는 hotfix/CF-<Issue 번호> 형식이어야 합니다",
                    result.errors,
                )

    def test_rejects_develop_promotion_to_main(self) -> None:
        result = validate_branch_flow("develop", "main")

        self.assertIn("릴리스 브랜치를 통해 main으로 병합해야 합니다", result.errors)

    def test_accepts_main_to_develop_as_structural_hotfix_sync_path(self) -> None:
        result = validate_branch_flow("main", "develop")

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_release_branch_to_main(self) -> None:
        result = validate_branch_flow("release/1.0.0", "main")

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_release_branch_to_develop(self) -> None:
        result = validate_branch_flow("release/1.0.0", "develop")

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_issue_branch_to_release(self) -> None:
        result = validate_branch_flow("CF-123", "release/1.0.0")

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_main_to_release_as_structural_hotfix_sync_path(self) -> None:
        result = validate_branch_flow("main", "release/1.0.0")

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_invalid_release_versions(self) -> None:
        for branch in (
            "release/1.0",
            "release/v1.0.0",
            "release/01.0.0",
            "release/1.0.0-beta",
        ):
            with self.subTest(branch=branch):
                result = validate_branch_flow(branch, "main")

                self.assertIn("release 브랜치는 release/<MAJOR.MINOR.PATCH> 형식이어야 합니다", result.errors)

    def test_accepts_revert_branch_to_main(self) -> None:
        result = validate_branch_flow("revert/0123abc", "main")

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_invalid_revert_branch(self) -> None:
        result = validate_branch_flow("revert/not-a-sha", "main")

        self.assertIn("되돌림 브랜치는 revert/<commit-sha> 형식이어야 합니다", result.errors)

    def test_rejects_revert_branch_to_develop(self) -> None:
        result = validate_branch_flow("revert/0123abc", "develop")

        self.assertIn("되돌림 브랜치는 main으로만 병합합니다", result.errors)

    def test_rejects_legacy_feature_branch(self) -> None:
        result = validate_branch_flow("feature/123-samsung-adapter", "develop")

        self.assertIn(
            "작업 브랜치는 CF-<Issue 번호> 형식이어야 합니다",
            result.errors,
        )

    def test_rejects_issue_branch_without_positive_number(self) -> None:
        result = validate_branch_flow("CF-0", "develop")

        self.assertIn(
            "작업 브랜치는 CF-<Issue 번호> 형식이어야 합니다",
            result.errors,
        )


if __name__ == "__main__":
    unittest.main()
