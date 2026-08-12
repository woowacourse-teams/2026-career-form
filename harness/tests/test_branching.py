import unittest

from harness.lib.branching import validate_branch_flow


class BranchingTest(unittest.TestCase):
    def test_accepts_issue_branch_to_develop(self) -> None:
        result = validate_branch_flow("CF-123", "develop")

        self.assertTrue(result.is_valid)

    def test_rejects_issue_branch_to_main(self) -> None:
        result = validate_branch_flow("CF-321", "main")

        self.assertIn(
            "일반 작업 브랜치는 develop으로만 병합합니다",
            result.errors,
        )

    def test_accepts_develop_promotion_to_main(self) -> None:
        result = validate_branch_flow("develop", "main")

        self.assertTrue(result.is_valid)

    def test_rejects_main_back_merge_to_develop(self) -> None:
        result = validate_branch_flow("main", "develop")

        self.assertIn(
            "프로덕션 승격은 develop에서 main 방향만 허용합니다",
            result.errors,
        )

    def test_rejects_release_branch(self) -> None:
        result = validate_branch_flow("release/1.0.0", "main")

        self.assertIn("release 브랜치는 사용하지 않습니다", result.errors)

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
