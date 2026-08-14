import unittest

from harness.lib.pr_contract import validate_pr
from harness.tests.pr_fixtures import VALID_PR_BODY


class PullRequestContractTest(unittest.TestCase):
    def test_accepts_feature_pr_to_develop(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertTrue(result.is_valid)

    def test_accepts_plan_pr_to_develop(self) -> None:
        result = validate_pr(
            {
                "title": "[Plan] 프로필 저장 구조 결정",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_colon_closing_keyword(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY.replace("Closes #123", "CLOSES: #123"),
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_current_repository_qualified_reference(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY.replace(
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
                        "body": VALID_PR_BODY + "\n" + ignored,
                        "head": {"ref": "CF-123"},
                        "base": {"ref": "develop"},
                    }
                )

                self.assertTrue(result.is_valid, result.errors)

    def test_rejects_code_example_without_real_closing_keyword(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY.replace(
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
                "body": VALID_PR_BODY.replace("\nCloses #123\n", "\n"),
                "head": {"ref": "release/1.2.3"},
                "base": {"ref": "main"},
            }
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_release_prefix_that_is_all_uppercase(self) -> None:
        result = validate_pr(
            {
                "title": "[RELEASE] 프로덕션 배포",
                "body": VALID_PR_BODY.replace("\nCloses #123\n", "\n"),
                "head": {"ref": "release/1.2.3"},
                "base": {"ref": "main"},
            }
        )

        self.assertIn(
            "배포 PR 제목은 [Release] 작업명 형식이어야 합니다",
            result.errors,
        )

    def test_rejects_release_title_on_feature_pr(self) -> None:
        result = validate_pr(
            {
                "title": "[Release] 프로덕션 배포",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn(
            "영역은 FE, BE, Infra, Harness, Plan 중 하나여야 합니다",
            result.errors,
        )

    def test_rejects_release_pr_that_closes_issue(self) -> None:
        result = validate_pr(
            {
                "title": "[Release] 프로덕션 배포",
                "body": VALID_PR_BODY,
                "head": {"ref": "release/1.2.3"},
                "base": {"ref": "main"},
            }
        )

        self.assertIn("시스템 PR은 Issue를 종료하지 않습니다", result.errors)

    def test_rejects_pr_without_closing_issue(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY.replace("Closes #123", "Refs #123"),
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR은 Closes #<Issue 번호>를 포함해야 합니다", result.errors)

    def test_rejects_invalid_title(self) -> None:
        result = validate_pr(
            {
                "title": "feat: 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("제목은 [영역] 작업명 형식이어야 합니다", result.errors)

    def test_rejects_missing_pr_section(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY.replace(
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
                "body": VALID_PR_BODY.replace(
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

    def test_rejects_required_sections_inside_fenced_code(self) -> None:
        fenced_sections = "\n\n".join(
            (
                "## 해결하려는 문제가 무엇인가요?\n- 예시",
                "## 왜 해야 하나요?\n- 예시",
                "## 어떻게 해결했나요?\n- 예시",
                "## 이 PR의 한계 & 트레이드오프\n- 예시",
                "## 기존 기능에 미치는 영향\n- 예시",
                "## Edge Case & 실패 시나리오\n- 예시",
                "## 검토한 대안과 선택 이유\n- 예시",
                "## 리뷰 포인트 (파일/영역별 Risk 🔴🟡🟢)\n- 예시",
            )
        )
        body = f"```markdown\n{fenced_sections}\n```\n\nCloses #123\n"

        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": body,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn(
            "PR 필수 섹션이 없습니다: 해결하려는 문제가 무엇인가요?",
            result.errors,
        )

    def test_rejects_title_that_differs_from_linked_issue(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            },
            linked_issue_title="[FE] CJ 채용 사이트 필드 자동 입력",
        )

        self.assertIn("PR 제목은 연결 Issue 제목과 같아야 합니다", result.errors)

    def test_rejects_issue_number_mismatch_between_branch_and_body(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY.replace("Closes #123", "Closes #456"),
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
                "body": VALID_PR_BODY + "\nCloses #456\n",
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR은 하나의 Issue만 종료해야 합니다", result.errors)

    def test_rejects_multiple_github_closing_keywords(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY + "\nFixes #456\n",
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR은 하나의 Issue만 종료해야 합니다", result.errors)

    def test_rejects_colon_keyword_that_closes_external_issue(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY
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
                "body": VALID_PR_BODY.replace(
                    "Closes #123",
                    "Resolves: woowacourse-teams/other-repository#123",
                ),
                "head": {"ref": "release/1.2.3"},
                "base": {"ref": "main"},
            }
        )

        self.assertIn("시스템 PR은 Issue를 종료하지 않습니다", result.errors)

    def test_accepts_issue_branch_to_release_as_work_pr(self) -> None:
        result = validate_pr(
            {
                "title": "[Harness] 릴리스 수정",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "release/1.2.3"},
            },
            linked_issue_title="[Harness] 릴리스 수정",
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_issue_branch_to_main_without_hotfix_label(self) -> None:
        result = validate_pr(
            {
                "title": "[Harness] 운영 긴급 수정",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "main"},
                "labels": [],
            },
            linked_issue_title="[Harness] 운영 긴급 수정",
        )

        self.assertIn("main 직접 병합에는 hotfix 라벨이 필요합니다", result.errors)

    def test_accepts_issue_branch_to_main_with_pr_hotfix_label(self) -> None:
        result = validate_pr(
            {
                "title": "[Harness] 운영 긴급 수정",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "main"},
                "labels": [{"name": "hotfix"}],
            },
            linked_issue_title="[Harness] 운영 긴급 수정",
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_issue_branch_to_main_with_issue_hotfix_label(self) -> None:
        result = validate_pr(
            {
                "title": "[Harness] 운영 긴급 수정",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "main"},
                "labels": [],
            },
            linked_issue_title="[Harness] 운영 긴급 수정",
            linked_issue_labels=("hotfix",),
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_main_sync_without_pr_hotfix_label(self) -> None:
        result = validate_pr(
            {
                "title": "[Release] 핫픽스 동기화",
                "body": VALID_PR_BODY.replace("\nCloses #123\n", "\n"),
                "head": {"ref": "main"},
                "base": {"ref": "develop"},
                "labels": [],
            }
        )

        self.assertIn("main 동기화 PR에는 hotfix 라벨이 필요합니다", result.errors)

    def test_accepts_main_sync_with_pr_hotfix_label(self) -> None:
        for base in ("develop", "release/1.2.3"):
            with self.subTest(base=base):
                result = validate_pr(
                    {
                        "title": "[Release] 핫픽스 동기화",
                        "body": VALID_PR_BODY.replace("\nCloses #123\n", "\n"),
                        "head": {"ref": "main"},
                        "base": {"ref": base},
                        "labels": [{"name": "hotfix"}],
                    }
                )

                self.assertTrue(result.is_valid, result.errors)

    def test_accepts_release_and_revert_system_prs_without_closing_issue(self) -> None:
        for head, base in (
            ("release/1.2.3", "main"),
            ("release/1.2.3", "develop"),
            ("revert/0123abc", "main"),
        ):
            with self.subTest(head=head, base=base):
                result = validate_pr(
                    {
                        "title": "[Release] 릴리스 상태 반영",
                        "body": VALID_PR_BODY.replace("\nCloses #123\n", "\n"),
                        "head": {"ref": head},
                        "base": {"ref": base},
                    }
                )

                self.assertTrue(result.is_valid, result.errors)

    def test_rejects_work_title_and_closing_issue_on_system_pr(self) -> None:
        result = validate_pr(
            {
                "title": "[Harness] 릴리스 상태 반영",
                "body": VALID_PR_BODY,
                "head": {"ref": "release/1.2.3"},
                "base": {"ref": "main"},
            }
        )

        self.assertIn(
            "배포 PR 제목은 [Release] 작업명 형식이어야 합니다",
            result.errors,
        )
        self.assertIn("시스템 PR은 Issue를 종료하지 않습니다", result.errors)

    def test_rejects_pr_title_with_declarative_handa_ending(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력을 지원한다",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("작업명은 한다로 끝낼 수 없습니다", result.errors)


if __name__ == "__main__":
    unittest.main()
