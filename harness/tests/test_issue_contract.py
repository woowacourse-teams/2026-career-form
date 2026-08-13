import unittest

from harness.lib.issue_contract import validate_issue, validate_issue_event


VALID_BODY = """## 배경
채용 사이트마다 입력 필드 구조가 다르다.

## 목표
삼성 채용 사이트의 필드를 안전하게 입력한다.

## 포함 범위
- 삼성 지원서 필드 매핑

## 제외 범위
- 실제 지원서 제출

## 인수 조건
- [ ] 지원하는 필드가 한 번씩 입력된다

## 자동 검증
- Adapter 단위 테스트

## 수동 검증
- 개발 서버에서 입력 결과 확인

## 위험 작업
- 없음
"""


class IssueContractTest(unittest.TestCase):
    def test_accepts_ready_issue_with_contract_sections(self) -> None:
        result = validate_issue(
            {
                "title": "[FE] 삼성 채용 사이트 자동 입력",
                "body": VALID_BODY,
                "labels": [{"name": "status:ready"}],
            }
        )

        self.assertTrue(result.is_valid)

    def test_accepts_ready_plan_issue(self) -> None:
        result = validate_issue(
            {
                "title": "[Plan] 프로필 저장 구조 결정",
                "body": VALID_BODY,
                "labels": [{"name": "status:ready"}],
            }
        )

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_issue_that_is_not_ready(self) -> None:
        result = validate_issue(
            {
                "title": "[FE] 삼성 채용 사이트 자동 입력",
                "body": VALID_BODY,
                "labels": [{"name": "status:planning"}],
            }
        )

        self.assertIn("status:ready 라벨이 필요합니다", result.errors)

    def test_rejects_missing_contract_section(self) -> None:
        result = validate_issue(
            {
                "body": VALID_BODY.replace("## 제외 범위", "## 기타"),
                "title": "[FE] 삼성 채용 사이트 자동 입력",
                "labels": [{"name": "status:ready"}],
            }
        )

        self.assertIn("필수 섹션이 없습니다: 제외 범위", result.errors)

    def test_rejects_unchecked_acceptance_criteria_absence(self) -> None:
        result = validate_issue(
            {
                "body": VALID_BODY.replace(
                    "- [ ] 지원하는 필드가 한 번씩 입력된다",
                    "결과를 확인한다",
                ),
                "title": "[FE] 삼성 채용 사이트 자동 입력",
                "labels": [{"name": "status:ready"}],
            }
        )

        self.assertIn("인수 조건에는 체크리스트가 필요합니다", result.errors)

    def test_rejects_empty_acceptance_checkbox(self) -> None:
        result = validate_issue(
            {
                "body": VALID_BODY.replace(
                    "- [ ] 지원하는 필드가 한 번씩 입력된다",
                    "- [ ] ",
                ),
                "title": "[FE] 삼성 채용 사이트 자동 입력",
                "labels": [{"name": "status:ready"}],
            }
        )

        self.assertIn("인수 조건에는 체크리스트가 필요합니다", result.errors)

    def test_rejects_body_edit_after_issue_is_ready(self) -> None:
        result = validate_issue_event(
            {
                "action": "edited",
                "changes": {"body": {"from": "이전 본문"}},
                "issue": {
                    "title": "[FE] 삼성 채용 사이트 자동 입력",
                    "body": VALID_BODY,
                    "labels": [{"name": "status:in-progress"}],
                },
            }
        )

        self.assertIn("ready 이후에는 Issue 본문을 수정할 수 없습니다", result.errors)

    def test_allows_body_edit_while_issue_is_planning(self) -> None:
        result = validate_issue_event(
            {
                "action": "edited",
                "changes": {"body": {"from": "이전 본문"}},
                "issue": {
                    "title": "[FE] 삼성 채용 사이트 자동 입력",
                    "body": VALID_BODY,
                    "labels": [{"name": "status:planning"}],
                },
            }
        )

        self.assertTrue(result.is_valid)

    def test_rejects_ready_issue_without_area_prefix(self) -> None:
        result = validate_issue(
            {
                "title": "삼성 채용 사이트 자동 입력",
                "body": VALID_BODY,
                "labels": [{"name": "status:ready"}],
            }
        )

        self.assertIn("제목은 [영역] 작업명 형식이어야 합니다", result.errors)

    def test_rejects_ready_issue_with_declarative_handa_ending(self) -> None:
        result = validate_issue(
            {
                "title": "[FE] 삼성 채용 사이트 자동 입력을 지원한다",
                "body": VALID_BODY,
                "labels": [{"name": "status:ready"}],
            }
        )

        self.assertIn("작업명은 한다로 끝낼 수 없습니다", result.errors)


if __name__ == "__main__":
    unittest.main()
