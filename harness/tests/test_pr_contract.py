import unittest

from harness.lib.pr_contract import validate_pr


VALID_BODY = """## 해결하려는 문제가 무엇인가요?
- 삼성 채용 사이트 지원이 없다

## 왜 해야 하나요?
- 반복 입력 비용을 줄여야 한다

## 어떻게 해결했나요?
- 삼성 Adapter와 자동화 테스트를 추가했다

## 이 PR의 한계 & 트레이드오프
- 실제 제출은 자동화하지 않는다

## 기존 기능에 미치는 영향
- 기존 Adapter 동작은 유지한다

## Edge Case & 실패 시나리오
- 알 수 없는 필드는 입력 불가로 표시한다

## 검토한 대안과 선택 이유
- 범용 매처보다 회사별 Adapter가 안전하다

## 리뷰 포인트 (파일/영역별 Risk 🔴🟡🟢)
- 🔴 Adapter 필드 매핑

Closes #123
"""


class PullRequestContractTest(unittest.TestCase):
    def test_accepts_feature_pr_to_develop(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertTrue(result.is_valid)

    def test_accepts_colon_closing_keyword(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY.replace("Closes #123", "CLOSES: #123"),
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_current_repository_qualified_reference(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY.replace(
                    "Closes #123",
                    "Closes woowacourse-teams/2026-career-form#123",
                ),
                "head": {"ref": "CF-123"},
                "base": {
                    "ref": "develop",
                    "repo": {
                        "full_name": "woowacourse-teams/2026-career-form",
                    },
                },
            }
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_ignores_closing_keywords_in_markdown_code_and_comments(self) -> None:
        ignored_examples = (
            "`Closes #456`",
            "```text\nCloses #456\n```",
            "```text\nCloses #456\n````",
            "~~~text\nCloses #456\n~~~",
            "~~~text\nCloses #456\n~~~~",
            "    Closes #456",
            "<!-- Fixes #456 -->",
        )
        for ignored in ignored_examples:
            with self.subTest(ignored=ignored):
                result = validate_pr(
                    {
                        "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                        "body": VALID_BODY + "\n" + ignored,
                        "head": {"ref": "CF-123"},
                        "base": {"ref": "develop"},
                    }
                )

                self.assertTrue(result.is_valid, result.errors)

    def test_rejects_code_example_without_real_closing_keyword(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY.replace(
                    "Closes #123",
                    "```text\nCloses #123\n```",
                ),
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR은 Closes #<Issue 번호>를 포함해야 합니다", result.errors)

    def test_accepts_release_pr_without_closing_issue(self) -> None:
        result = validate_pr(
            {
                "title": "[Release] 프로덕션 배포",
                "body": VALID_BODY.replace("\nCloses #123\n", "\n"),
                "head": {"ref": "develop"},
                "base": {"ref": "main"},
            }
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_release_title_on_feature_pr(self) -> None:
        result = validate_pr(
            {
                "title": "[Release] 프로덕션 배포",
                "body": VALID_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn(
            "영역은 FE, BE, Infra, Harness 중 하나여야 합니다",
            result.errors,
        )

    def test_rejects_release_pr_that_closes_issue(self) -> None:
        result = validate_pr(
            {
                "title": "[Release] 프로덕션 배포",
                "body": VALID_BODY,
                "head": {"ref": "develop"},
                "base": {"ref": "main"},
            }
        )

        self.assertIn("배포 PR은 Issue를 종료하지 않습니다", result.errors)

    def test_rejects_pr_without_closing_issue(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY.replace("Closes #123", "Refs #123"),
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR은 Closes #<Issue 번호>를 포함해야 합니다", result.errors)

    def test_rejects_invalid_title(self) -> None:
        result = validate_pr(
            {
                "title": "feat: 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("제목은 [영역] 작업명 형식이어야 합니다", result.errors)

    def test_rejects_missing_pr_section(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY.replace(
                    "## 이 PR의 한계 & 트레이드오프",
                    "## 기타",
                ),
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn(
            "PR 필수 섹션이 없습니다: 이 PR의 한계 & 트레이드오프",
            result.errors,
        )

    def test_rejects_empty_pr_section(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY.replace(
                    "## 기존 기능에 미치는 영향\n- 기존 Adapter 동작은 유지한다",
                    "## 기존 기능에 미치는 영향",
                ),
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn(
            "PR 필수 섹션이 없습니다: 기존 기능에 미치는 영향",
            result.errors,
        )

    def test_rejects_issue_number_mismatch_between_branch_and_body(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY.replace("Closes #123", "Closes #456"),
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn(
            "브랜치의 Issue 번호와 PR이 종료하는 Issue 번호가 다릅니다",
            result.errors,
        )

    def test_rejects_pr_that_closes_multiple_issues(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY + "\nCloses #456\n",
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR은 하나의 Issue만 종료해야 합니다", result.errors)

    def test_rejects_multiple_github_closing_keywords(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY + "\nFixes #456\n",
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR은 하나의 Issue만 종료해야 합니다", result.errors)

    def test_rejects_colon_keyword_that_closes_external_issue(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_BODY
                + "\nFIXES: woowacourse-teams/other-repository#456\n",
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR은 하나의 Issue만 종료해야 합니다", result.errors)

    def test_rejects_release_pr_with_external_closing_reference(self) -> None:
        result = validate_pr(
            {
                "title": "[Release] 프로덕션 배포",
                "body": VALID_BODY.replace(
                    "Closes #123",
                    "Resolves: woowacourse-teams/other-repository#123",
                ),
                "head": {"ref": "develop"},
                "base": {"ref": "main"},
            }
        )

        self.assertIn("배포 PR은 Issue를 종료하지 않습니다", result.errors)

    def test_rejects_pr_title_with_declarative_handa_ending(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력을 지원한다",
                "body": VALID_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("작업명은 한다로 끝낼 수 없습니다", result.errors)


if __name__ == "__main__":
    unittest.main()
