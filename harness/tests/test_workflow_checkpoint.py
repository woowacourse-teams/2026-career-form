import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from harness.lib.workflow_checkpoint import (
    CheckpointError,
    StageCheckpoint,
    WorkflowCheckpoint,
    approve_knowledge,
    begin_stage,
    checkpoint_from,
    checkpoint_path,
    complete_stage,
    initialize_checkpoint,
    knowledge_digest,
    load_checkpoint,
    replace_knowledge_candidates,
    resume_stage,
    save_checkpoint,
    stage_checkpoint,
)


class WorkflowCheckpointTest(unittest.TestCase):
    def test_upgrades_unfinished_v1_checkpoint_before_knowledge_stage(self) -> None:
        checkpoint = checkpoint_from(
            {
                "schema_version": 1,
                "issue_number": 34,
                "branch": "CF-34",
                "current_stage": "implementation",
                "stages": [
                    {
                        "name": "plan",
                        "status": "completed",
                        "started_head": "start-head",
                        "completed_head": "plan-head",
                        "evidence": {"plan_path": "cf-workflow/plan.md"},
                    },
                    {
                        "name": "implementation",
                        "status": "completed",
                        "started_head": "plan-head",
                        "completed_head": "implementation-head",
                        "evidence": {"commit": "implementation-head"},
                    },
                ],
            }
        )

        advanced = begin_stage(
            checkpoint,
            stage="knowledge",
            head="implementation-head",
        )

        self.assertEqual(2, advanced.schema_version)
        self.assertEqual("knowledge", advanced.current_stage)

    def test_preserves_completed_v1_draft_pr_without_new_knowledge_gate(self) -> None:
        payload = self._completed_v1_payload()

        checkpoint = checkpoint_from(payload)

        self.assertEqual(1, checkpoint.schema_version)
        self.assertEqual("draft_pr", checkpoint.current_stage)
        self.assertEqual("completed", stage_checkpoint(checkpoint, "draft_pr").status)

    def test_replacing_candidates_invalidates_existing_approval(self) -> None:
        checkpoint = self._running_knowledge_checkpoint()
        checkpoint = replace_knowledge_candidates(checkpoint, ("결정 A",))
        approved = approve_knowledge(checkpoint, knowledge_digest(checkpoint))

        changed = replace_knowledge_candidates(approved, ("결정 B",))

        self.assertIsNotNone(approved.knowledge_approval_digest)
        self.assertIsNone(changed.knowledge_approval_digest)

    def test_rejects_recorded_knowledge_without_matching_approval(self) -> None:
        checkpoint = replace_knowledge_candidates(
            self._running_knowledge_checkpoint(),
            ("Issue raw는 병합 뒤 수정하지 않는다",),
        )

        with self.assertRaisesRegex(CheckpointError, "승인"):
            complete_stage(
                checkpoint,
                stage="knowledge",
                head="implementation-head",
                evidence={
                    "outcome": "Recorded",
                    "approval_digest": knowledge_digest(checkpoint),
                    "manifest": "llm-wiki/raw/issues/CF-34/manifest.md",
                },
            )

    def test_completes_no_reusable_knowledge_with_approved_empty_candidates(self) -> None:
        checkpoint = self._running_knowledge_checkpoint()
        checkpoint = approve_knowledge(checkpoint, knowledge_digest(checkpoint))

        completed = complete_stage(
            checkpoint,
            stage="knowledge",
            head="implementation-head",
            evidence={
                "outcome": "No reusable knowledge",
                "approval_digest": knowledge_digest(checkpoint),
            },
        )

        self.assertEqual("completed", stage_checkpoint(completed, "knowledge").status)

    def test_initializes_plan_before_work_starts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repository = self._init_repository(Path(directory) / "repository")

            checkpoint = initialize_checkpoint(
                repository,
                issue_number=34,
                branch="CF-34",
                head="start-head",
            )
            restored = load_checkpoint(repository)

        self.assertEqual(checkpoint, restored)
        self.assertEqual("plan", restored.current_stage)
        self.assertEqual("running", stage_checkpoint(restored, "plan").status)
        self.assertEqual(
            "start-head", stage_checkpoint(restored, "plan").started_head
        )

    def test_keeps_running_stage_when_completion_was_not_recorded(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repository = self._init_repository(Path(directory) / "repository")
            initialize_checkpoint(
                repository,
                issue_number=34,
                branch="CF-34",
                head="start-head",
            )

            restored = load_checkpoint(repository)

        self.assertEqual("plan", restored.current_stage)
        self.assertEqual("running", stage_checkpoint(restored, "plan").status)

    def test_records_completion_before_next_stage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repository = self._init_repository(Path(directory) / "repository")
            checkpoint = initialize_checkpoint(
                repository,
                issue_number=34,
                branch="CF-34",
                head="start-head",
            )
            checkpoint = complete_stage(
                checkpoint,
                stage="plan",
                head="plan-head",
                evidence={"plan_path": ".git/cf-workflow/plan.md"},
            )
            checkpoint = begin_stage(
                checkpoint,
                stage="implementation",
                head="plan-head",
            )
            save_checkpoint(repository, checkpoint)

            restored = load_checkpoint(repository)

        plan = stage_checkpoint(restored, "plan")
        self.assertEqual("completed", plan.status)
        self.assertEqual("plan-head", plan.completed_head)
        self.assertEqual(
            (("plan_path", ".git/cf-workflow/plan.md"),),
            plan.evidence,
        )
        self.assertEqual("implementation", restored.current_stage)
        self.assertEqual(
            "running", stage_checkpoint(restored, "implementation").status
        )

    def test_rejects_next_stage_before_current_stage_completion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repository = self._init_repository(Path(directory) / "repository")
            checkpoint = initialize_checkpoint(
                repository,
                issue_number=34,
                branch="CF-34",
                head="start-head",
            )

            with self.assertRaisesRegex(CheckpointError, "완료"):
                begin_stage(
                    checkpoint,
                    stage="implementation",
                    head="start-head",
                )

    def test_rejects_completion_without_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repository = self._init_repository(Path(directory) / "repository")
            checkpoint = initialize_checkpoint(
                repository,
                issue_number=34,
                branch="CF-34",
                head="start-head",
            )

            with self.assertRaisesRegex(CheckpointError, "완료 근거"):
                complete_stage(
                    checkpoint,
                    stage="plan",
                    head="plan-head",
                    evidence={},
                )

    def test_requires_stage_specific_completion_evidence(self) -> None:
        cases = (
            (
                self._running_checkpoint("plan"),
                "plan",
                "plan-head",
                {"note": "done"},
                "plan_path",
            ),
            (
                self._running_checkpoint("implementation"),
                "implementation",
                "implementation-head",
                {"commit": "different-head"},
                "commit",
            ),
            (
                self._running_checkpoint("verification"),
                "verification",
                "verified-head",
                {"command": "harness/scripts/verify.py"},
                "result",
            ),
            (
                self._running_checkpoint("draft_pr"),
                "draft_pr",
                "verified-head",
                {"pr_number": "0", "pr_url": "not-a-url"},
                "Draft PR",
            ),
        )
        for checkpoint, stage, head, evidence, message in cases:
            with self.subTest(stage=stage):
                with self.assertRaisesRegex(CheckpointError, message):
                    complete_stage(
                        checkpoint,
                        stage=stage,
                        head=head,
                        evidence=evidence,
                    )

    def test_rejects_corrupted_checkpoint(self) -> None:
        invalid_payloads = (
            "{",
            json.dumps(
                {
                    "schema_version": 99,
                    "issue_number": 34,
                    "branch": "CF-34",
                    "current_stage": "plan",
                    "stages": [],
                }
            ),
            json.dumps(
                {
                    "schema_version": 1,
                    "issue_number": 34,
                    "branch": "CF-34",
                    "current_stage": "plan",
                    "stages": [
                        {
                            "name": "plan",
                            "status": "completed",
                            "started_head": "start-head",
                            "completed_head": "plan-head",
                            "evidence": {},
                        }
                    ],
                }
            ),
        )
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with tempfile.TemporaryDirectory() as directory:
                    repository = self._init_repository(
                        Path(directory) / "repository"
                    )
                    path = checkpoint_path(repository)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(payload, encoding="utf-8")

                    with self.assertRaises(CheckpointError):
                        load_checkpoint(repository)

    def test_isolates_linked_worktree_checkpoint(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = self._init_repository(Path(directory) / "source")
            linked = Path(directory) / "linked"
            self._git(
                source,
                "worktree",
                "add",
                "-q",
                "-b",
                "CF-35",
                str(linked),
            )

            initialize_checkpoint(
                source,
                issue_number=34,
                branch="develop",
                head="source-head",
            )
            initialize_checkpoint(
                linked,
                issue_number=35,
                branch="CF-35",
                head="linked-head",
            )

            source_path = checkpoint_path(source)
            linked_path = checkpoint_path(linked)
            source_checkpoint = load_checkpoint(source)
            linked_checkpoint = load_checkpoint(linked)

        self.assertNotEqual(source_path, linked_path)
        self.assertEqual(34, source_checkpoint.issue_number)
        self.assertEqual(35, linked_checkpoint.issue_number)

    def test_atomic_update_leaves_only_checkpoint_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repository = self._init_repository(Path(directory) / "repository")
            checkpoint = initialize_checkpoint(
                repository,
                issue_number=34,
                branch="CF-34",
                head="start-head",
            )
            checkpoint = complete_stage(
                checkpoint,
                stage="plan",
                head="plan-head",
                evidence={"plan_path": ".git/cf-workflow/plan.md"},
            )
            save_checkpoint(repository, checkpoint)

            names = tuple(path.name for path in checkpoint_path(repository).parent.iterdir())

        self.assertEqual(("checkpoint.json",), names)

    def test_restarts_completed_stage_with_current_head(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repository = self._init_repository(Path(directory) / "repository")
            checkpoint = initialize_checkpoint(
                repository,
                issue_number=34,
                branch="CF-34",
                head="start-head",
            )
            checkpoint = complete_stage(
                checkpoint,
                stage="plan",
                head="plan-head",
                evidence={"plan_path": ".git/cf-workflow/plan.md"},
            )
            checkpoint = begin_stage(
                checkpoint,
                stage="implementation",
                head="plan-head",
            )
            checkpoint = complete_stage(
                checkpoint,
                stage="implementation",
                head="implementation-head",
                evidence={"commit": "implementation-head"},
            )
            checkpoint = begin_stage(
                checkpoint,
                stage="knowledge",
                head="implementation-head",
            )
            checkpoint = approve_knowledge(
                checkpoint,
                knowledge_digest(checkpoint),
            )
            checkpoint = complete_stage(
                checkpoint,
                stage="knowledge",
                head="implementation-head",
                evidence={
                    "outcome": "No reusable knowledge",
                    "approval_digest": knowledge_digest(checkpoint),
                },
            )
            checkpoint = begin_stage(
                checkpoint,
                stage="verification",
                head="implementation-head",
            )
            checkpoint = complete_stage(
                checkpoint,
                stage="verification",
                head="verified-head",
                evidence={
                    "command": "harness/scripts/verify.py",
                    "result": "passed",
                },
            )

            restarted = resume_stage(
                checkpoint,
                stage="verification",
                head="changed-head",
            )

        self.assertEqual("verification", restarted.current_stage)
        verification = stage_checkpoint(restarted, "verification")
        self.assertEqual("running", verification.status)
        self.assertEqual("changed-head", verification.started_head)
        self.assertIsNone(verification.completed_head)

    def test_preserves_start_head_when_running_stage_resumes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repository = self._init_repository(Path(directory) / "repository")
            checkpoint = initialize_checkpoint(
                repository,
                issue_number=34,
                branch="CF-34",
                head="original-head",
            )

            resumed = resume_stage(
                checkpoint,
                stage="plan",
                head="later-head",
            )

        self.assertEqual(checkpoint, resumed)
        self.assertEqual(
            "original-head",
            stage_checkpoint(resumed, "plan").started_head,
        )

    def test_ignores_parent_git_environment_for_target_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            foreign = self._init_repository(root / "foreign")
            target = self._init_repository(root / "target")
            foreign_git_dir = self._git_output(
                foreign, "rev-parse", "--absolute-git-dir"
            )

            with patch.dict(os.environ, {"GIT_DIR": foreign_git_dir}):
                initialize_checkpoint(
                    target,
                    issue_number=34,
                    branch="CF-34",
                    head="target-head",
                )
                target_path = checkpoint_path(target)

        self.assertEqual(
            target.resolve() / ".git" / "cf-workflow" / "checkpoint.json",
            target_path,
        )

    def _init_repository(self, path: Path) -> Path:
        path.mkdir()
        subprocess.run(
            ("git", "init", "-q", "-b", "develop"),
            cwd=path,
            env=self._git_environment(),
            check=True,
        )
        self._git(path, "config", "user.name", "Harness Test")
        self._git(path, "config", "user.email", "harness@example.com")
        self._git(path, "commit", "--allow-empty", "-q", "-m", "initial")
        return path

    def _git(self, path: Path, *arguments: str) -> None:
        subprocess.run(
            ("git", *arguments),
            cwd=path,
            env=self._git_environment(),
            check=True,
        )

    def _git_output(self, path: Path, *arguments: str) -> str:
        return subprocess.run(
            ("git", *arguments),
            cwd=path,
            env=self._git_environment(),
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()

    def _git_environment(self) -> dict[str, str]:
        environment = os.environ.copy()
        for name in (
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_COMMON_DIR",
            "GIT_INDEX_FILE",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
            "GIT_PREFIX",
        ):
            environment.pop(name, None)
        return environment

    def _running_checkpoint(self, stage: str) -> WorkflowCheckpoint:
        records = (
            StageCheckpoint(
                "plan",
                "completed",
                "start-head",
                "plan-head",
                (("plan_path", ".git/cf-workflow/plan.md"),),
            ),
            StageCheckpoint(
                "implementation",
                "completed",
                "plan-head",
                "implementation-head",
                (("commit", "implementation-head"),),
            ),
            StageCheckpoint(
                "verification",
                "completed",
                "implementation-head",
                "verified-head",
                (
                    ("command", "harness/scripts/verify.py"),
                    ("result", "passed"),
                ),
            ),
        )
        index = ("plan", "implementation", "verification", "draft_pr").index(
            stage
        )
        return WorkflowCheckpoint(
            schema_version=1,
            issue_number=34,
            branch="CF-34",
            current_stage=stage,
            stages=(*records[:index], StageCheckpoint(stage, "running", "head")),
        )

    def _running_knowledge_checkpoint(self) -> WorkflowCheckpoint:
        checkpoint = WorkflowCheckpoint(
            schema_version=2,
            issue_number=34,
            branch="CF-34",
            current_stage="implementation",
            stages=(
                StageCheckpoint(
                    "plan",
                    "completed",
                    "start-head",
                    "plan-head",
                    (("plan_path", "cf-workflow/plan.md"),),
                ),
                StageCheckpoint(
                    "implementation",
                    "completed",
                    "plan-head",
                    "implementation-head",
                    (("commit", "implementation-head"),),
                ),
            ),
        )
        return begin_stage(
            checkpoint,
            stage="knowledge",
            head="implementation-head",
        )

    def _completed_v1_payload(self) -> dict[str, object]:
        stages = [
            {
                "name": "plan",
                "status": "completed",
                "started_head": "start-head",
                "completed_head": "plan-head",
                "evidence": {"plan_path": ".git/cf-workflow/plan.md"},
            },
            {
                "name": "implementation",
                "status": "completed",
                "started_head": "plan-head",
                "completed_head": "verified-head",
                "evidence": {"commit": "verified-head"},
            },
            {
                "name": "verification",
                "status": "completed",
                "started_head": "verified-head",
                "completed_head": "verified-head",
                "evidence": {
                    "command": "harness/scripts/verify.py",
                    "result": "passed",
                },
            },
            {
                "name": "draft_pr",
                "status": "completed",
                "started_head": "verified-head",
                "completed_head": "verified-head",
                "evidence": {
                    "pr_number": "36",
                    "pr_url": "https://github.com/acme/repo/pull/36",
                },
            },
        ]
        return {
            "schema_version": 1,
            "issue_number": 34,
            "branch": "CF-34",
            "current_stage": "draft_pr",
            "stages": stages,
        }


if __name__ == "__main__":
    unittest.main()
