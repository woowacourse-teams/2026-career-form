import unittest

from harness.lib.issue_delivery import (
    DeliveryError,
    DeliveryObservation,
    next_delivery_action,
)
from harness.lib.workflow_checkpoint import (
    StageCheckpoint,
    WorkflowCheckpoint,
    begin_stage,
    complete_stage,
    knowledge_digest,
    approve_knowledge,
)


class IssueDeliveryTest(unittest.TestCase):
    def test_resumes_running_stage(self) -> None:
        checkpoint = self._initial_checkpoint()

        action = next_delivery_action(
            checkpoint,
            DeliveryObservation(
                issue_number=34,
                branch="CF-34",
                head="start-head",
                plan_exists=True,
            ),
        )

        self.assertEqual("resume_plan", action.code)

    def test_resumes_plan_when_completed_plan_file_is_missing(self) -> None:
        checkpoint = self._completed_implementation()

        action = next_delivery_action(
            checkpoint,
            DeliveryObservation(
                issue_number=34,
                branch="CF-34",
                head="implementation-head",
                plan_exists=False,
            ),
        )

        self.assertEqual("resume_plan", action.code)

    def test_selects_knowledge_review_after_implementation(self) -> None:
        checkpoint = self._completed_implementation()

        action = next_delivery_action(
            checkpoint,
            DeliveryObservation(
                issue_number=34,
                branch="CF-34",
                head="implementation-head",
                plan_exists=True,
            ),
        )

        self.assertEqual("resume_knowledge", action.code)

    def test_selects_verification_after_knowledge_decision(self) -> None:
        checkpoint = self._completed_knowledge()

        action = next_delivery_action(
            checkpoint,
            DeliveryObservation(
                issue_number=34,
                branch="CF-34",
                head="implementation-head",
                plan_exists=True,
            ),
        )

        self.assertEqual("resume_verification", action.code)

    def test_selects_draft_pr_for_verified_current_head(self) -> None:
        checkpoint = self._completed_verification()

        action = next_delivery_action(
            checkpoint,
            DeliveryObservation(
                issue_number=34,
                branch="CF-34",
                head="verified-head",
                plan_exists=True,
            ),
        )

        self.assertEqual("create_draft_pr", action.code)

    def test_repeats_verification_when_head_changed(self) -> None:
        checkpoint = self._completed_verification()

        action = next_delivery_action(
            checkpoint,
            DeliveryObservation(
                issue_number=34,
                branch="CF-34",
                head="changed-head",
                plan_exists=True,
            ),
        )

        self.assertEqual("resume_verification", action.code)

    def test_records_existing_pr_instead_of_creating_it_again(self) -> None:
        checkpoint = begin_stage(
            self._completed_verification(),
            stage="draft_pr",
            head="verified-head",
        )

        action = next_delivery_action(
            checkpoint,
            DeliveryObservation(
                issue_number=34,
                branch="CF-34",
                head="verified-head",
                plan_exists=True,
                pull_request_number=36,
                pull_request_head="verified-head",
            ),
        )

        self.assertEqual("record_draft_pr", action.code)

    def test_records_existing_pr_when_start_record_is_missing(self) -> None:
        action = next_delivery_action(
            self._completed_verification(),
            DeliveryObservation(
                issue_number=34,
                branch="CF-34",
                head="verified-head",
                plan_exists=True,
                pull_request_number=36,
                pull_request_head="verified-head",
            ),
        )

        self.assertEqual("record_draft_pr", action.code)

    def test_rejects_checkpoint_from_another_branch(self) -> None:
        with self.assertRaisesRegex(DeliveryError, "브랜치"):
            next_delivery_action(
                self._initial_checkpoint(),
                DeliveryObservation(
                    issue_number=34,
                    branch="CF-35",
                    head="start-head",
                    plan_exists=True,
                ),
            )

    def _initial_checkpoint(self) -> WorkflowCheckpoint:
        return WorkflowCheckpoint(
            schema_version=2,
            issue_number=34,
            branch="CF-34",
            current_stage="plan",
            stages=(StageCheckpoint("plan", "running", "start-head"),),
        )

    def _completed_implementation(self) -> WorkflowCheckpoint:
        checkpoint = complete_stage(
            self._initial_checkpoint(),
            stage="plan",
            head="plan-head",
            evidence={"plan_path": "docs/plans/34-workflow-checkpoint.md"},
        )
        checkpoint = begin_stage(
            checkpoint,
            stage="implementation",
            head="plan-head",
        )
        return complete_stage(
            checkpoint,
            stage="implementation",
            head="implementation-head",
            evidence={"commit": "implementation-head"},
        )

    def _completed_verification(self) -> WorkflowCheckpoint:
        checkpoint = begin_stage(
            self._completed_knowledge(),
            stage="verification",
            head="implementation-head",
        )
        return complete_stage(
            checkpoint,
            stage="verification",
            head="verified-head",
            evidence={
                "command": "harness/scripts/verify.py",
                "result": "passed",
            },
        )

    def _completed_knowledge(self) -> WorkflowCheckpoint:
        checkpoint = begin_stage(
            self._completed_implementation(),
            stage="knowledge",
            head="implementation-head",
        )
        checkpoint = approve_knowledge(checkpoint, knowledge_digest(checkpoint))
        return complete_stage(
            checkpoint,
            stage="knowledge",
            head="implementation-head",
            evidence={
                "outcome": "No reusable knowledge",
                "approval_digest": knowledge_digest(checkpoint),
            },
        )


if __name__ == "__main__":
    unittest.main()
