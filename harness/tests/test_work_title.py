import unittest

from harness.lib.work_title import validate_work_title


class WorkTitleTest(unittest.TestCase):
    def test_accepts_supported_area(self) -> None:
        for title in (
            "[FE] 지원서 자동 입력",
            "[BE] 지원서 저장 API",
            "[INFRA] 개발 서버 배포 환경",
            "[HARNESS] Codex 개발 하네스 구축",
            "[PLAN] 프로필 저장 구조 결정",
        ):
            with self.subTest(title=title):
                result = validate_work_title(title)

                self.assertTrue(result.is_valid)

    def test_rejects_area_prefix_that_is_not_all_uppercase(self) -> None:
        for title in (
            "[fe] 지원서 자동 입력",
            "[Be] 지원서 저장 API",
            "[Infra] 개발 서버 배포 환경",
            "[Harness] Codex 개발 하네스 구축",
            "[Plan] 프로필 저장 구조 결정",
        ):
            with self.subTest(title=title):
                result = validate_work_title(title)

                self.assertIn(
                    "영역은 FE, BE, INFRA, HARNESS, PLAN 중 하나여야 합니다",
                    result.errors,
                )

    def test_rejects_unknown_area(self) -> None:
        result = validate_work_title("[Docs] 개발 가이드 정리")

        self.assertIn(
            "영역은 FE, BE, INFRA, HARNESS, PLAN 중 하나여야 합니다",
            result.errors,
        )

    def test_rejects_conventional_commit_prefix_in_description(self) -> None:
        result = validate_work_title("[FE] feat: 지원서 자동 입력")

        self.assertIn(
            "Issue와 PR 제목에 Conventional Commit type을 사용할 수 없습니다",
            result.errors,
        )

    def test_rejects_scoped_breaking_conventional_prefix(self) -> None:
        for title in (
            "[FE] feat!: 지원서 자동 입력",
            "[FE] feat(adapter): 지원서 자동 입력",
            "[FE] feat(adapter)!: 지원서 자동 입력",
        ):
            with self.subTest(title=title):
                result = validate_work_title(title)

                self.assertIn(
                    "Issue와 PR 제목에 Conventional Commit type을 사용할 수 없습니다",
                    result.errors,
                )

    def test_rejects_declarative_formal_ending(self) -> None:
        result = validate_work_title("[FE] 지원서 자동 입력을 구현합니다")

        self.assertIn("작업명은 명사형이어야 합니다", result.errors)


if __name__ == "__main__":
    unittest.main()
