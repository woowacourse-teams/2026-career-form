import unittest

from harness.lib.commit_message import validate_commit_message


class CommitMessageTest(unittest.TestCase):
    def test_accepts_korean_conventional_commit_without_scope(self) -> None:
        result = validate_commit_message("feat: 삼성 채용 사이트 필드 자동 입력 지원")

        self.assertTrue(result.is_valid)
        self.assertEqual((), result.errors)

    def test_accepts_breaking_change_with_footer(self) -> None:
        result = validate_commit_message(
            "feat!: Fill 요청에 schemaVersion 필수 추가\n\n"
            "BREAKING CHANGE: 모든 클라이언트는 schemaVersion을 포함해야 한다."
        )

        self.assertTrue(result.is_valid)

    def test_rejects_scope(self) -> None:
        result = validate_commit_message("feat(api): 필드 자동 입력 지원")

        self.assertIn("scope는 사용할 수 없습니다", result.errors)

    def test_rejects_unsupported_type(self) -> None:
        result = validate_commit_message("style: 파일 정리")

        self.assertIn("허용되지 않은 type입니다: style", result.errors)

    def test_rejects_english_only_description(self) -> None:
        result = validate_commit_message("feat: add field automation")

        self.assertIn("설명에는 한글이 포함되어야 합니다", result.errors)

    def test_rejects_period_at_end_of_title(self) -> None:
        result = validate_commit_message("fix: 중복 입력 문제 수정.")

        self.assertIn("제목 끝에 마침표를 사용할 수 없습니다", result.errors)

    def test_rejects_breaking_title_without_footer(self) -> None:
        result = validate_commit_message("feat!: 요청 필드 변경")

        self.assertIn(
            "Breaking Change에는 BREAKING CHANGE Footer가 필요합니다",
            result.errors,
        )

    def test_rejects_declarative_handa_ending(self) -> None:
        result = validate_commit_message("feat: GitHub Project 접근 진단을 추가한다")

        self.assertIn("커밋 설명은 한다로 끝낼 수 없습니다", result.errors)


if __name__ == "__main__":
    unittest.main()
