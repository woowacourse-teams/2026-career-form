import unittest

from harness.lib.project_status import UnsupportedStatusLabel, project_status_for_label


class ProjectStatusTest(unittest.TestCase):
    def test_keeps_promoted_planning_and_ready_issues_in_progress(self) -> None:
        self.assertEqual(
            "In Progress",
            project_status_for_label("status:planning"),
        )
        self.assertEqual("In Progress", project_status_for_label("status:ready"))

    def test_maps_active_labels_to_in_progress(self) -> None:
        self.assertEqual(
            "In Progress",
            project_status_for_label("status:in-progress"),
        )
        self.assertEqual("In Progress", project_status_for_label("status:blocked"))

    def test_maps_review_to_on_review(self) -> None:
        self.assertEqual("On Review", project_status_for_label("status:review"))

    def test_rejects_unknown_status_label(self) -> None:
        with self.assertRaisesRegex(UnsupportedStatusLabel, "status:unknown"):
            project_status_for_label("status:unknown")


if __name__ == "__main__":
    unittest.main()
