import unittest

from harness.lib.pr_labels import select_pr_labels, validate_pr_labels


class PrLabelsTest(unittest.TestCase):
    def test_selects_pr_classification_labels_in_first_seen_order(self) -> None:
        result = select_pr_labels(
            {
                "issue": {
                    "labels": [
                        {"name": "status:in-progress"},
                        {"name": "type:technical"},
                        {"name": "frontend-change"},
                        {"name": "backend-change"},
                        {"name": "infra-change"},
                        {"name": "harness-change"},
                    ]
                }
            }
        )

        self.assertEqual(
            (
                "type:technical",
                "frontend-change",
                "backend-change",
                "infra-change",
                "harness-change",
            ),
            result,
        )

    def test_removes_duplicate_pr_labels(self) -> None:
        result = select_pr_labels(
            {
                "labels": [
                    {"name": "harness-change"},
                    {"name": "harness-change"},
                ]
            }
        )

        self.assertEqual(("harness-change",), result)

    def test_excludes_all_issue_status_labels(self) -> None:
        result = select_pr_labels(
            {
                "labels": [
                    {"name": "status:planning"},
                    {"name": "status:ready"},
                    {"name": "status:in-progress"},
                    {"name": "status:blocked"},
                    {"name": "status:review"},
                ]
            }
        )

        self.assertEqual((), result)

    def test_returns_empty_when_issue_has_no_pr_classification_label(self) -> None:
        result = select_pr_labels(
            {"labels": [{"name": "question"}, {"name": "documentation"}]}
        )

        self.assertEqual((), result)

    def test_rejects_non_list_labels(self) -> None:
        with self.assertRaisesRegex(ValueError, "labels는 목록이어야 합니다"):
            select_pr_labels({"labels": "harness-change"})

    def test_rejects_malformed_label_entry(self) -> None:
        with self.assertRaisesRegex(ValueError, "label name은 문자열이어야 합니다"):
            select_pr_labels({"labels": [{"name": False}]})

    def test_rejects_pr_missing_expected_issue_label(self) -> None:
        result = validate_pr_labels(
            {"labels": [{"name": "harness-change"}]},
            {"pull_request": {"labels": []}},
        )

        self.assertIn(
            "PR에 필요한 변경 분류 라벨이 없습니다: harness-change",
            result.errors,
        )

    def test_rejects_issue_status_label_on_pr(self) -> None:
        result = validate_pr_labels(
            {"labels": [{"name": "type:technical"}]},
            {
                "pull_request": {
                    "labels": [
                        {"name": "type:technical"},
                        {"name": "status:in-progress"},
                    ]
                }
            },
        )

        self.assertIn(
            "PR에는 Issue 상태 라벨을 적용할 수 없습니다: status:in-progress",
            result.errors,
        )

    def test_accepts_extra_non_status_pr_label(self) -> None:
        result = validate_pr_labels(
            {"labels": [{"name": "frontend-change"}]},
            {
                "labels": [
                    {"name": "frontend-change"},
                    {"name": "documentation"},
                ]
            },
        )

        self.assertTrue(result.is_valid)


if __name__ == "__main__":
    unittest.main()
