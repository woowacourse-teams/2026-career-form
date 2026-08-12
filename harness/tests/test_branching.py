import unittest

from harness.lib.branching import validate_branch_flow


class BranchingTest(unittest.TestCase):
    def test_accepts_feature_branch_to_develop(self) -> None:
        result = validate_branch_flow("feature/123-samsung-adapter", "develop")

        self.assertTrue(result.is_valid)

    def test_accepts_hotfix_branch_to_main(self) -> None:
        result = validate_branch_flow("hotfix/321-duplicate-fill", "main")

        self.assertTrue(result.is_valid)

    def test_accepts_develop_promotion_to_main(self) -> None:
        result = validate_branch_flow("develop", "main")

        self.assertTrue(result.is_valid)

    def test_accepts_main_back_merge_to_develop(self) -> None:
        result = validate_branch_flow("main", "develop")

        self.assertTrue(result.is_valid)

    def test_rejects_release_branch(self) -> None:
        result = validate_branch_flow("release/1.0.0", "main")

        self.assertIn("release 브랜치는 사용하지 않습니다", result.errors)

    def test_rejects_feature_branch_without_issue_number(self) -> None:
        result = validate_branch_flow("feature/samsung-adapter", "develop")

        self.assertIn(
            "작업 브랜치는 <종류>/<Issue 번호>-<slug> 형식이어야 합니다",
            result.errors,
        )

    def test_rejects_feature_branch_targeting_main(self) -> None:
        result = validate_branch_flow("feature/123-samsung-adapter", "main")

        self.assertIn("feature 브랜치는 develop으로만 병합합니다", result.errors)


if __name__ == "__main__":
    unittest.main()
