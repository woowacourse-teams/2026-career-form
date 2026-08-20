import unittest

from harness.lib.project_issue import (
    PLANNING_ACTIONS,
    ProjectIssueSnapshot,
    next_planning_action,
)


class ProjectIssuePlanningTest(unittest.TestCase):
    def test_awaits_human_draft_when_none_matches(self) -> None:
        action = next_planning_action(ProjectIssueSnapshot(draft_matches=0))

        self.assertEqual("await_draft", action.code)

    def test_selects_draft_when_multiple_match(self) -> None:
        action = next_planning_action(ProjectIssueSnapshot(draft_matches=2))

        self.assertEqual("select_draft", action.code)

    def test_promotes_exactly_one_draft(self) -> None:
        action = next_planning_action(ProjectIssueSnapshot(draft_matches=1))

        self.assertEqual("promote_draft", action.code)

    def test_fixes_nonconforming_draft_title_before_promotion(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(draft_matches=1, title_valid=False)
        )

        self.assertEqual("fix_title", action.code)

    def test_fixes_nonconforming_existing_issue_title(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                title_valid=False,
            )
        )

        self.assertEqual("fix_title", action.code)

    def test_existing_issue_is_not_promoted_again(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(draft_matches=0, issue_number=21)
        )

        self.assertEqual("set_planning", action.code)

    def test_sets_project_in_progress_after_planning_label(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                issue_status_label="status:planning",
            )
        )

        self.assertEqual("set_in_progress", action.code)

    def test_retries_in_progress_transition_until_observed(self) -> None:
        snapshot = ProjectIssueSnapshot(
            draft_matches=0,
            issue_number=21,
            issue_status_label="status:planning",
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
                issue_status_label="status:planning",
                project_status="In Progress",
            )
        )

        self.assertEqual("draft_contract", action.code)

    def test_writes_plan_after_contract(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                issue_status_label="status:planning",
                project_status="In Progress",
                contract_drafted=True,
            )
        )

        self.assertEqual("write_plan", action.code)

    def test_publishes_contract_after_plan(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                issue_status_label="status:planning",
                project_status="In Progress",
                contract_drafted=True,
                plan_exists=True,
            )
        )

        self.assertEqual("publish_planning_contract", action.code)

    def test_awaits_human_approval_after_contract_is_published(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                issue_status_label="status:planning",
                project_status="In Progress",
                contract_drafted=True,
                plan_exists=True,
                contract_published=True,
            )
        )

        self.assertEqual("await_approval", action.code)

    def test_restores_planning_label_during_remote_issue_edit(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                issue_status_label=None,
                project_status="In Progress",
                contract_drafted=True,
                plan_exists=True,
                contract_published=True,
            )
        )

        self.assertEqual("set_planning", action.code)

    def test_validates_remote_contract_after_human_approval(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=21,
                issue_status_label="status:planning",
                project_status="In Progress",
                contract_drafted=True,
                plan_exists=True,
                approved=True,
                contract_published=True,
            )
        )

        self.assertEqual("validate_latest_contract", action.code)

    def test_reawaits_approval_when_remote_contract_changes(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=34,
                issue_status_label="status:planning",
                project_status="In Progress",
                contract_drafted=True,
                plan_exists=True,
                contract_published=True,
                approved=True,
                approved_contract_digest="approved",
                latest_contract_digest="changed",
            )
        )

        self.assertEqual("await_approval", action.code)

    def test_completes_planning_after_contract_is_published(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=1,
                issue_status_label="status:ready",
                project_status="In Progress",
                contract_drafted=True,
                plan_exists=True,
                approved=True,
                contract_published=True,
                contract_valid=True,
            )
        )

        self.assertEqual("complete", action.code)

    def test_sets_ready_after_contract_is_published(self) -> None:
        action = next_planning_action(
            ProjectIssueSnapshot(
                draft_matches=0,
                issue_number=1,
                issue_status_label="status:planning",
                project_status="In Progress",
                contract_drafted=True,
                plan_exists=True,
                approved=True,
                contract_published=True,
                contract_valid=True,
            )
        )

        self.assertEqual("set_ready", action.code)

    def test_preserves_human_block_during_planning(self) -> None:
        for contract_published in (False, True):
            for title_valid in (False, True):
                with self.subTest(
                    contract_published=contract_published,
                    title_valid=title_valid,
                ):
                    action = next_planning_action(
                        ProjectIssueSnapshot(
                            draft_matches=0,
                            issue_number=1,
                            title_valid=title_valid,
                            issue_status_label="status:blocked",
                            project_status="In Progress",
                            contract_drafted=True,
                            plan_exists=True,
                            approved=True,
                            contract_published=contract_published,
                        )
                    )

                    self.assertEqual("await_unblock", action.code)

    def test_never_exposes_sub_issue_action(self) -> None:
        self.assertNotIn("create_sub_issue", PLANNING_ACTIONS)
        self.assertNotIn("create_draft", PLANNING_ACTIONS)


if __name__ == "__main__":
    unittest.main()
