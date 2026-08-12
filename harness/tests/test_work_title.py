import unittest

from harness.lib.work_title import validate_work_title


class WorkTitleTest(unittest.TestCase):
    def test_accepts_supported_area(self) -> None:
        result = validate_work_title("[Harness] Codex 개발 하네스 구축")

        self.assertTrue(result.is_valid)

    def test_rejects_unknown_area(self) -> None:
        result = validate_work_title("[Docs] 개발 가이드 정리")

        self.assertIn(
            "영역은 FE, BE, Infra, Harness 중 하나여야 합니다",
            result.errors,
        )

    def test_rejects_conventional_commit_prefix_in_description(self) -> None:
        result = validate_work_title("[FE] feat: 지원서 자동 입력")

        self.assertIn(
            "Issue와 PR 제목에 Conventional Commit type을 사용할 수 없습니다",
            result.errors,
        )


if __name__ == "__main__":
    unittest.main()
