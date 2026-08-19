import tempfile
import unittest
from pathlib import Path

from harness.lib.issue_contract import validate_issue
from harness.lib.pr_contract import REQUIRED_SECTIONS, validate_pr
from harness.lib.template_body import render_issue_form, render_pr_template


ROOT = Path(__file__).resolve().parents[2]


class TemplateBodyTest(unittest.TestCase):
    def test_issue_body_uses_labels_and_defaults_from_selected_form(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            form = Path(directory) / "technical.yml"
            form.write_text(
                """name: 기술 작업
description: 테스트
body:
  - type: markdown
    attributes:
      value: 개인정보를 기록하지 않습니다.
  - type: textarea
    id: background
    attributes:
      label: 변경된 배경
  - type: textarea
    id: acceptance
    attributes:
      label: 인수 조건
      value: \"- [ ] \"
""",
                encoding="utf-8",
            )

            body = render_issue_form(
                form,
                {"background": "Windows에서 실행되지 않습니다."},
            )

            self.assertIn("개인정보를 기록하지 않습니다.", body)
            self.assertIn("## 변경된 배경\n\nWindows에서 실행되지 않습니다.", body)
            self.assertIn("## 인수 조건\n\n- [ ]", body)

    def test_issue_body_rejects_unknown_answer_id(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            form = Path(directory) / "technical.yml"
            form.write_text(
                """name: 기술 작업
description: 테스트
body:
  - type: textarea
    id: background
    attributes:
      label: 배경
""",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "알 수 없는 Issue Form 입력"):
                render_issue_form(form, {"missing": "값"})

    def test_pr_body_replaces_answer_markers_and_preserves_template_structure(
        self,
    ) -> None:
        template = """## 무엇이 바뀌었나요?
<!-- 결과를 작성합니다. -->
<!-- cf-answer: 무엇이 바뀌었나요? -->

<details>
<summary>검증 기록</summary>

### 자동 검증
<!-- cf-answer: 자동 검증 -->
</details>

Closes #
"""

        try:
            body = render_pr_template(
                template,
                {
                    "무엇이 바뀌었나요?": "- 새 동작",
                    "자동 검증": "- 전체 검증 통과",
                },
                issue_number=32,
            )
        except ValueError as error:
            self.fail(f"답변 표식을 사용한 렌더링이 실패했습니다: {error}")

        self.assertIn("<!-- 결과를 작성합니다. -->", body)
        self.assertIn("<details>", body)
        self.assertIn("- 전체 검증 통과", body)
        self.assertNotIn("cf-answer:", body)
        self.assertIn("Closes #32", body)

    def test_pr_body_uses_actual_template_and_closing_issue(self) -> None:
        template = """안내문

## 문제

- 작성 안내

## 해결

- 작성 안내

Closes #
"""

        body = render_pr_template(
            template,
            {"문제": "실행 경로가 다릅니다.", "해결": "공통 선택기를 사용합니다."},
            issue_number=14,
        )

        self.assertIn("안내문", body)
        self.assertIn("## 문제\n\n실행 경로가 다릅니다.", body)
        self.assertIn("## 해결\n\n공통 선택기를 사용합니다.", body)
        self.assertIn("Closes #14", body)
        self.assertNotIn("작성 안내", body)

    def test_pr_body_requires_an_answer_for_every_template_section(self) -> None:
        template = "## 문제\n\n- 작성 안내\n\n## 해결\n\n- 작성 안내\n\nCloses #\n"

        with self.assertRaisesRegex(ValueError, "PR 템플릿 섹션 응답"):
            render_pr_template(template, {"문제": "문제"}, issue_number=14)

    def test_pr_body_rejects_duplicate_answer_markers(self) -> None:
        template = """## 변경
<!-- cf-answer: 변경 -->
<!-- cf-answer: 변경 -->

Closes #
"""

        with self.assertRaisesRegex(ValueError, "중복"):
            render_pr_template(template, {"변경": "새 동작"}, issue_number=14)

    def test_repository_templates_render_bodies_that_pass_independent_contracts(self) -> None:
        issue_answers = {
            "background": "Windows와 POSIX 실행 경로가 다릅니다.",
            "goal": "운영체제별 Python을 선택합니다.",
            "in-scope": "- 하네스 실행 경로",
            "out-of-scope": "- 제품 기능",
            "acceptance": "- [ ] 두 운영체제에서 검증이 통과합니다",
            "automated-validation": "- 전체 하네스 검증",
            "manual-validation": "- Windows PowerShell 확인",
            "risky-operations": "- 없음",
            "references": "- Issue #14",
        }
        issue_body = render_issue_form(
            ROOT / ".github" / "ISSUE_TEMPLATE" / "technical-task.yml",
            issue_answers,
        )
        issue_result = validate_issue(
            {
                "title": "[Harness] 공용 하네스 실행 경로 정비",
                "body": issue_body,
                "labels": [{"name": "status:ready"}],
            }
        )

        pr_template = (ROOT / ".github" / "pull_request_template.md").read_text(
            encoding="utf-8"
        )
        pr_body = render_pr_template(
            pr_template,
            {section: f"{section}에 대한 검증된 내용" for section in REQUIRED_SECTIONS},
            issue_number=14,
        )
        pr_result = validate_pr(
            {
                "title": "[Harness] 공용 하네스 실행 경로 정비",
                "body": pr_body,
                "head": {"ref": "CF-14"},
                "base": {"ref": "develop"},
            },
            linked_issue_title="[Harness] 공용 하네스 실행 경로 정비",
        )

        self.assertTrue(issue_result.is_valid, issue_result.errors)
        self.assertTrue(pr_result.is_valid, pr_result.errors)


if __name__ == "__main__":
    unittest.main()
