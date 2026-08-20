import unittest

from harness.lib.tool_guard import evaluate_tool_use
from harness.lib.workflow_checkpoint import (
    StageCheckpoint,
    WorkflowCheckpoint,
    begin_stage,
    complete_stage,
)


class ToolGuardTest(unittest.TestCase):
    def test_allows_safe_test_command_on_issue_branch(self) -> None:
        decision = evaluate_tool_use(
            {"tool_name": "Bash", "tool_input": {"command": "python3 -m unittest"}},
            branch="CF-123",
        )

        self.assertFalse(decision.blocked)

    def test_blocks_malformed_bash_input(self) -> None:
        decision = evaluate_tool_use(
            {"tool_name": "Bash", "tool_input": {}},
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("도구 입력", decision.reason)

    def test_blocks_recursive_delete(self) -> None:
        decision = evaluate_tool_use(
            {"tool_name": "Bash", "tool_input": {"command": "rm -rf build"}},
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("삭제 명령", decision.reason)

    def test_blocks_unlink_command(self) -> None:
        decision = evaluate_tool_use(
            {"tool_name": "Bash", "tool_input": {"command": "unlink build.log"}},
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("삭제 명령", decision.reason)

    def test_blocks_secret_path_read_through_python(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "Bash",
                "tool_input": {"command": "python3 -c \"open('.env').read()\""},
            },
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("시크릿", decision.reason)

    def test_blocks_destructive_mcp_tool(self) -> None:
        decision = evaluate_tool_use(
            {"tool_name": "mcp__github__merge_pull_request", "tool_input": {}},
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("위험 도구", decision.reason)

    def test_blocks_mcp_file_removal(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "mcp__filesystem__remove_file",
                "tool_input": {"path": "build.log"},
            },
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("위험 도구", decision.reason)

    def test_blocks_mcp_secret_file_read(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "mcp__filesystem__read_file",
                "tool_input": {"path": ".env"},
            },
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("시크릿", decision.reason)

    def test_blocks_secret_access(self) -> None:
        decision = evaluate_tool_use(
            {"tool_name": "Bash", "tool_input": {"command": "gh auth token"}},
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("시크릿 접근", decision.reason)

    def test_blocks_force_push(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "Bash",
                "tool_input": {"command": "git push origin CF-123 --force"},
            },
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("파괴적 Git 명령", decision.reason)

    def test_blocks_direct_push_to_long_lived_branch(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "Bash",
                "tool_input": {"command": "git push origin HEAD:main"},
            },
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("장기 브랜치 직접 push", decision.reason)

    def test_blocks_force_branch_deletion(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "Bash",
                "tool_input": {"command": "git branch -D CF-122"},
            },
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("파괴적 Git 명령", decision.reason)

    def test_blocks_pull_request_merge(self) -> None:
        decision = evaluate_tool_use(
            {"tool_name": "Bash", "tool_input": {"command": "gh pr merge 123"}},
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("PR 최종 승인과 머지", decision.reason)

    def test_blocks_inline_github_issue_or_pr_body(self) -> None:
        for command in (
            "gh issue edit 14 --body '본문'",
            "gh pr create --body=본문",
        ):
            with self.subTest(command=command):
                decision = evaluate_tool_use(
                    {"tool_name": "Bash", "tool_input": {"command": command}},
                    branch="CF-14",
                )

                self.assertTrue(decision.blocked)
                self.assertIn("body-file", decision.reason)

    def test_allows_github_issue_body_file(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "Bash",
                "tool_input": {"command": "gh issue edit 14 --body-file /tmp/issue.md"},
            },
            branch="CF-14",
        )

        self.assertFalse(decision.blocked)

    def test_blocks_draft_pr_without_checkpoint(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "Bash",
                "tool_input": {
                    "command": "gh pr create --draft --body-file /tmp/pr.md"
                },
            },
            branch="CF-34",
            current_head="verified-head",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("검증", decision.reason)

    def test_blocks_draft_pr_when_verified_head_changed(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "Bash",
                "tool_input": {
                    "command": "gh pr create --draft --body-file /tmp/pr.md"
                },
            },
            branch="CF-34",
            checkpoint=self._verified_checkpoint(),
            current_head="changed-head",
            worktree_clean=True,
        )

        self.assertTrue(decision.blocked)
        self.assertIn("현재 HEAD", decision.reason)

    def test_allows_draft_pr_for_verified_current_head(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "Bash",
                "tool_input": {
                    "command": "gh pr create --draft --body-file /tmp/pr.md"
                },
            },
            branch="CF-34",
            checkpoint=self._verified_checkpoint(),
            current_head="verified-head",
            worktree_clean=True,
        )

        self.assertFalse(decision.blocked)

    def test_blocks_migration_execution(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "Bash",
                "tool_input": {"command": "python manage.py migrate"},
            },
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("마이그레이션", decision.reason)

    def test_blocks_deployment_execution(self) -> None:
        decision = evaluate_tool_use(
            {"tool_name": "Bash", "tool_input": {"command": "kubectl apply -f app.yml"}},
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("배포", decision.reason)

    def test_blocks_write_tool_on_long_lived_branch(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "apply_patch",
                "tool_input": {"command": "*** Begin Patch\n*** End Patch"},
            },
            branch="develop",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("장기 브랜치", decision.reason)

    def test_blocks_secret_file_patch(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "apply_patch",
                "tool_input": {
                    "command": "*** Update File: .env\n-SECRET=old\n+SECRET=new"
                },
            },
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("시크릿 파일", decision.reason)

    def test_blocks_file_deletion_patch(self) -> None:
        decision = evaluate_tool_use(
            {
                "tool_name": "apply_patch",
                "tool_input": {"command": "*** Delete File: src/legacy.py"},
            },
            branch="CF-123",
        )

        self.assertTrue(decision.blocked)
        self.assertIn("파일 삭제", decision.reason)

    def _verified_checkpoint(self) -> WorkflowCheckpoint:
        checkpoint = WorkflowCheckpoint(
            schema_version=1,
            issue_number=34,
            branch="CF-34",
            current_stage="plan",
            stages=(StageCheckpoint("plan", "running", "start-head"),),
        )
        checkpoint = complete_stage(
            checkpoint,
            stage="plan",
            head="plan-head",
            evidence={"plan_path": "docs/plans/34-workflow-checkpoint.md"},
        )
        checkpoint = begin_stage(
            checkpoint,
            stage="implementation",
            head="plan-head",
        )
        checkpoint = complete_stage(
            checkpoint,
            stage="implementation",
            head="verified-head",
            evidence={"commit": "verified-head"},
        )
        checkpoint = begin_stage(
            checkpoint,
            stage="verification",
            head="verified-head",
        )
        return complete_stage(
            checkpoint,
            stage="verification",
            head="verified-head",
            evidence={"command": "harness/scripts/verify.py"},
        )


if __name__ == "__main__":
    unittest.main()
