import unittest

from harness.lib.issue_lifecycle import (
    LifecycleSnapshot,
    lifecycle_snapshot_from,
    next_lifecycle_action,
)


class IssueLifecycleTest(unittest.TestCase):
    def test_starts_with_project_issue_planning(self) -> None:
        action = next_lifecycle_action(LifecycleSnapshot())

        self.assertEqual("plan_issue", action.code)
        self.assertEqual("cf-project-issue-planning", action.skill)

    def test_delivers_ready_issue(self) -> None:
        action = next_lifecycle_action(
            LifecycleSnapshot(issue_number=14, issue_status="status:ready")
        )

        self.assertEqual("deliver_issue", action.code)
        self.assertEqual("cf-issue-workflow", action.skill)

    def test_resumes_in_progress_issue_delivery(self) -> None:
        action = next_lifecycle_action(
            LifecycleSnapshot(issue_number=14, issue_status="status:in-progress")
        )

        self.assertEqual("deliver_issue", action.code)
        self.assertEqual("cf-issue-workflow", action.skill)

    def test_waits_for_human_edit_when_draft_pr_exists(self) -> None:
        action = next_lifecycle_action(
            LifecycleSnapshot(
                issue_number=14,
                issue_status="status:in-progress",
                pull_request_state="OPEN",
                pull_request_is_draft=True,
            )
        )

        self.assertEqual("await_pr_edit", action.code)
        self.assertIsNone(action.skill)

    def test_reviews_existing_draft_pr_after_human_confirmation(self) -> None:
        action = next_lifecycle_action(
            LifecycleSnapshot(
                issue_number=14,
                issue_status="status:in-progress",
                pull_request_state="OPEN",
                pull_request_is_draft=True,
                pr_edit_confirmed=True,
            )
        )

        self.assertEqual("review_draft_pr", action.code)
        self.assertEqual("cf-issue-workflow", action.skill)

    def test_preserves_human_block(self) -> None:
        action = next_lifecycle_action(
            LifecycleSnapshot(issue_number=14, issue_status="status:blocked")
        )

        self.assertEqual("await_unblock", action.code)
        self.assertIsNone(action.skill)

    def test_waits_for_human_merge_after_draft_pr(self) -> None:
        action = next_lifecycle_action(
            LifecycleSnapshot(
                issue_number=14,
                issue_status="status:review",
                pull_request_state="OPEN",
            )
        )

        self.assertEqual("await_merge", action.code)
        self.assertIsNone(action.skill)

    def test_cleans_up_only_after_merge(self) -> None:
        action = next_lifecycle_action(
            LifecycleSnapshot(
                issue_number=14,
                issue_status="closed",
                pull_request_state="MERGED",
            )
        )

        self.assertEqual("cleanup", action.code)
        self.assertEqual("cf-post-merge-cleanup", action.skill)

    def test_completes_after_cleanup(self) -> None:
        action = next_lifecycle_action(
            LifecycleSnapshot(
                issue_number=14,
                issue_status="closed",
                pull_request_state="MERGED",
                cleanup_complete=True,
            )
        )

        self.assertEqual("complete", action.code)

    def test_rejects_invalid_lifecycle_snapshot(self) -> None:
        with self.assertRaisesRegex(ValueError, "issue_number"):
            lifecycle_snapshot_from({"issue_number": "14"})

    def test_rejects_non_boolean_pr_edit_state(self) -> None:
        for name in ("pull_request_is_draft", "pr_edit_confirmed"):
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, name):
                    lifecycle_snapshot_from({name: "false"})


if __name__ == "__main__":
    unittest.main()
