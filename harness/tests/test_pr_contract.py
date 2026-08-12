import unittest

from harness.lib.pr_contract import validate_pr


VALID_BODY = """## 변경 요약
- 삼성 Adapter를 추가한다

## 인수 조건 충족 근거
- 지원 필드 테스트 통과

## 자동 검증
- `python3 -m unittest discover harness/tests`

## 수동 확인
- 개발 서버 확인 필요

## 제외 범위 및 후속 작업
- 실제 제출 제외

## 롤백
- PR 커밋 revert

Closes #123
"""


class PullRequestContractTest(unittest.TestCase):
    def test_accepts_feature_pr_to_develop(self) -> None:
        result = validate_pr(
            {
                "title": "feat: 삼성 채용 사이트 필드 자동 입력을 지원한다",
                "body": VALID_BODY,
                "head": {"ref": "feature/123-samsung-adapter"},
                "base": {"ref": "develop"},
            }
        )

        self.assertTrue(result.is_valid)

    def test_rejects_pr_without_closing_issue(self) -> None:
        result = validate_pr(
            {
                "title": "feat: 삼성 채용 사이트 필드 자동 입력을 지원한다",
                "body": VALID_BODY.replace("Closes #123", "Refs #123"),
                "head": {"ref": "feature/123-samsung-adapter"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR은 Closes #<Issue 번호>를 포함해야 합니다", result.errors)

    def test_rejects_invalid_title(self) -> None:
        result = validate_pr(
            {
                "title": "기능 작업",
                "body": VALID_BODY,
                "head": {"ref": "feature/123-samsung-adapter"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("커밋 제목은 <type>: <한글 설명> 형식이어야 합니다", result.errors)

    def test_rejects_missing_pr_section(self) -> None:
        result = validate_pr(
            {
                "title": "feat: 삼성 채용 사이트 필드 자동 입력을 지원한다",
                "body": VALID_BODY.replace("## 롤백", "## 기타"),
                "head": {"ref": "feature/123-samsung-adapter"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR 필수 섹션이 없습니다: 롤백", result.errors)

    def test_rejects_issue_number_mismatch_between_branch_and_body(self) -> None:
        result = validate_pr(
            {
                "title": "feat: 삼성 채용 사이트 필드 자동 입력을 지원한다",
                "body": VALID_BODY.replace("Closes #123", "Closes #456"),
                "head": {"ref": "feature/123-samsung-adapter"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn(
            "브랜치의 Issue 번호와 PR이 종료하는 Issue 번호가 다릅니다",
            result.errors,
        )


if __name__ == "__main__":
    unittest.main()
