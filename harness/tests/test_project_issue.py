import unittest

from harness.lib.project_issue import (
    PLANNING_ACTIONS,
    ProjectIssueSnapshot,
    next_planning_action,
)


class ProjectIssuePlanningTest(unittest.TestCase):
    def test_selects_draft_when_none_matches(self) -> None:
        action = next_planning_action(ProjectIssueSnapshot(draft_matches=0))

        self.assertEqual("select_draft", action.code)

    def test_selects_draft_when_multiple_match(self) -> None:
        action = next_planning_action(ProjectIssueSnapshot(draft_matches=2))

        self.assertEqual("select_draft", action.code)

    def test_promotes_exactly_one_draft(self) -> None:
        action = next_planning_action(ProjectIssueSnapshot(draft_matches=1))

        self.assertEqual("promote_draft", action.code)

    def test_existing_issue_is_not_promoted_again(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(draft_matches=0, issue_number=21)
        )

        self.assertEqual("set_in_progress", action.code)

    def test_retries_in_progress_transition_until_observed(self) -> None:
        snapshot = ProjectIssueSnapshot(
            draft_matches=0,
            issue_number=21,
            project_status="Todo",
        )

        first = next_planning_action(snapshot)
        retried = next_planning_action(snapshot)

        self.assertEqual("set_in_progress", first.code)
        self.assertEqual(first, retried)

    def test_drafts_contract_after_status_transition(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                project_status="In Progress",
            )
        )

        self.assertEqual("draft_contract", action.code)

    def test_writes_plan_after_contract(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                project_status="In Progress",
                contract_drafted=True,
            )
        )

        self.assertEqual("write_plan", action.code)

    def test_awaits_human_approval_after_plan(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                project_status="In Progress",
                contract_drafted=True,
                plan_exists=True,
            )
        )

        self.assertEqual("await_approval", action.code)

    def test_publishes_contract_after_approval(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                project_status="In Progress",
                contract_drafted=True,
                plan_exists=True,
                approved=True,
            )
        )

        self.assertEqual("publish_contract", action.code)

    def test_completes_planning_after_contract_is_published(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=1,
                project_status="In Progress",
                contract_drafted=True,
                plan_exists=True,
                approved=True,
                contract_published=True,
            )
        )

        self.assertEqual("complete", action.code)

    def test_never_exposes_sub_issue_action(self) -> None:
        self.assertNotIn("create_sub_issue", PLANNING_ACTIONS)


if __name__ == "__main__":
    unittest.main()
