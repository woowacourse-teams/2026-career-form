import unittest

from harness.lib.tool_guard import evaluate_tool_use


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


if __name__ == "__main__":
    unittest.main()
