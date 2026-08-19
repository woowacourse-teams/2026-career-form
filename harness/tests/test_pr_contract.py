import unittest

from harness.lib.pr_contract import validate_pr
from harness.tests.pr_fixtures import VALID_PR_BODY, VALID_VERIFICATION_RECORD


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

    def test_accepts_ai_pr_to_develop(self) -> None:
        result = validate_pr(
            {
                "title": "[AI] LLM 필드 매핑",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            },
            linked_issue_title="[AI] LLM 필드 매핑",
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
            "영역은 FE, BE, AI, Infra, Harness, Plan 중 하나여야 합니다",
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
                    "## 무엇이 바뀌었나요?",
                    "## 기타",
                ),
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn(
            "PR 필수 섹션이 없습니다: 무엇이 바뀌었나요?",
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
                "## 무엇이 바뀌었나요?\n- 예시",
                "## 왜 바꿨나요?\n- 예시",
                "## 어떻게 바꿨나요?\n- 예시",
                "## 기존 기능에 미치는 영향\n- 예시",
                "## 검토한 대안과 선택 이유\n- 예시",
                "## 리뷰 포인트\n- 예시",
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
            "PR 필수 섹션이 없습니다: 무엇이 바뀌었나요?",
            result.errors,
        )

    def test_rejects_missing_verification_record(self) -> None:
        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY.replace(VALID_VERIFICATION_RECORD, ""),
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR 검증 기록이 필요합니다", result.errors)

    def test_rejects_duplicate_verification_records(self) -> None:
        body = VALID_PR_BODY.replace(
            VALID_VERIFICATION_RECORD,
            f"{VALID_VERIFICATION_RECORD}\n\n{VALID_VERIFICATION_RECORD}",
        )

        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": body,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR 검증 기록은 하나만 작성해야 합니다", result.errors)

    def test_rejects_empty_verification_section(self) -> None:
        body = VALID_PR_BODY.replace(
            "### 자동 검증\n- 전체 검증 통과",
            "### 자동 검증\n<!-- 아직 검증하지 않음 -->",
        )

        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": body,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR 검증 기록이 없습니다: 자동 검증", result.errors)

    def test_rejects_verification_record_inside_fenced_code(self) -> None:
        body = VALID_PR_BODY.replace(
            VALID_VERIFICATION_RECORD,
            f"```markdown\n{VALID_VERIFICATION_RECORD}\n```",
        )

        result = validate_pr(
            {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": body,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        )

        self.assertIn("PR 검증 기록이 필요합니다", result.errors)

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

    def test_rejects_regular_issue_branch_to_main(self) -> None:
        result = validate_pr(
            {
                "title": "[Harness] 운영 긴급 수정",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "main"},
            },
            linked_issue_title="[Harness] 운영 긴급 수정",
        )

        self.assertIn(
            "일반 작업 브랜치는 main으로 병합할 수 없습니다",
            result.errors,
        )

    def test_accepts_hotfix_issue_branch_to_main_without_label(self) -> None:
        result = validate_pr(
            {
                "title": "[Harness] 운영 긴급 수정",
                "body": VALID_PR_BODY,
                "head": {"ref": "hotfix/CF-123"},
                "base": {"ref": "main"},
            },
            linked_issue_title="[Harness] 운영 긴급 수정",
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_hotfix_issue_number_mismatch(self) -> None:
        result = validate_pr(
            {
                "title": "[Harness] 운영 긴급 수정",
                "body": VALID_PR_BODY.replace("Closes #123", "Closes #456"),
                "head": {"ref": "hotfix/CF-123"},
                "base": {"ref": "main"},
            },
            linked_issue_title="[Harness] 운영 긴급 수정",
        )

        self.assertIn(
            "브랜치의 Issue 번호와 PR이 종료하는 Issue 번호가 다릅니다",
            result.errors,
        )

    def test_accepts_main_sync_without_hotfix_label(self) -> None:
        for base in ("develop", "release/1.2.3"):
            with self.subTest(base=base):
                result = validate_pr(
                    {
                        "title": "[Release] 핫픽스 동기화",
                        "body": VALID_PR_BODY.replace("\nCloses #123\n", "\n"),
                        "head": {"ref": "main"},
                        "base": {"ref": base},
                    }
                )

                self.assertTrue(result.is_valid, result.errors)

    def test_accepts_release_and_revert_system_prs_without_closing_issue(self) -> None:
        for head, base, draft in (
            ("release/1.2.3", "main", False),
            ("release/1.2.3", "develop", False),
            ("revert/0123abc", "main", True),
        ):
            with self.subTest(head=head, base=base):
                result = validate_pr(
                    {
                        "title": "[Release] 릴리스 상태 반영",
                        "body": VALID_PR_BODY.replace("\nCloses #123\n", "\n"),
                        "head": {"ref": head},
                        "base": {"ref": base},
                        "draft": draft,
                    }
                )

                self.assertTrue(result.is_valid, result.errors)

    def test_rejects_ready_revert_pr(self) -> None:
        result = validate_pr(
            {
                "title": "[Release] 운영 배포 되돌림",
                "body": VALID_PR_BODY.replace("\nCloses #123\n", "\n"),
                "head": {"ref": "revert/0123abc"},
                "base": {"ref": "main"},
                "draft": False,
            }
        )

        self.assertIn("되돌림 PR은 Draft 상태여야 합니다", result.errors)

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
