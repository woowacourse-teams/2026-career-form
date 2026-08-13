import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from harness.tests.pr_fixtures import VALID_PR_BODY


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "harness" / "scripts"


class HarnessScriptsTest(unittest.TestCase):
    def test_commit_message_script_accepts_valid_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            message = Path(directory) / "message.txt"
            message.write_text("feat: 지원서 필드 자동 입력 지원\n", encoding="utf-8")

            result = self._run("validate-commit-message", str(message))

        self.assertEqual(0, result.returncode, result.stderr)

    def test_issue_script_reads_github_event_payload(self) -> None:
        event = {
            "action": "labeled",
            "label": {"name": "status:ready"},
            "issue": {
                "title": "[PLAN] 지원서 필드 구조 결정",
                "body": self._valid_issue_body(),
                "labels": [{"name": "status:ready"}],
            }
        }

        with tempfile.TemporaryDirectory() as directory:
            payload = Path(directory) / "event.json"
            payload.write_text(json.dumps(event, ensure_ascii=False), encoding="utf-8")

            result = self._run("validate-issue", str(payload))

        self.assertEqual(0, result.returncode, result.stderr)

    def test_pr_script_accepts_plan_title(self) -> None:
        event = {
            "pull_request": {
                "title": "[PLAN] 지원서 필드 구조 결정",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        }
        linked_issue = {"title": "[PLAN] 지원서 필드 구조 결정"}

        with tempfile.TemporaryDirectory() as directory:
            payload = Path(directory) / "event.json"
            issue = Path(directory) / "issue.json"
            payload.write_text(json.dumps(event, ensure_ascii=False), encoding="utf-8")
            issue.write_text(json.dumps(linked_issue, ensure_ascii=False), encoding="utf-8")

            result = self._run("validate-pr", str(payload), str(issue))

        self.assertEqual(0, result.returncode, result.stderr)

    def test_pr_script_rejects_title_different_from_linked_issue(self) -> None:
        event = {
            "pull_request": {
                "title": "[FE] 삼성 채용 사이트 필드 자동 입력",
                "body": VALID_PR_BODY,
                "head": {"ref": "CF-123"},
                "base": {"ref": "develop"},
            }
        }
        linked_issue = {"title": "[FE] CJ 채용 사이트 필드 자동 입력"}

        with tempfile.TemporaryDirectory() as directory:
            payload = Path(directory) / "event.json"
            issue = Path(directory) / "issue.json"
            payload.write_text(json.dumps(event, ensure_ascii=False), encoding="utf-8")
            issue.write_text(json.dumps(linked_issue, ensure_ascii=False), encoding="utf-8")

            result = self._run("validate-pr", str(payload), str(issue))

        self.assertEqual(1, result.returncode)
        self.assertIn("PR 제목은 연결 Issue 제목과 같아야 합니다", result.stderr)

    def test_project_issue_script_rejects_string_booleans(self) -> None:
        for name in (
            "title_valid",
            "contract_drafted",
            "plan_exists",
            "approved",
            "contract_published",
        ):
            with self.subTest(name=name):
                result = self._run_project_issue_plan(
                    {
                        "draft_matches": 1,
                        name: "false",
                    }
                )

                self.assertEqual(2, result.returncode)
                self.assertIn(f"{name}는 boolean이어야 합니다", result.stderr)

    def test_project_issue_script_accepts_missing_boolean_fields(self) -> None:
        result = self._run_project_issue_plan({"draft_matches": 1})

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertTrue(result.stdout.startswith("promote_draft:"), result.stdout)

    def test_project_issue_script_rejects_invalid_status_label_type(self) -> None:
        result = self._run_project_issue_plan(
            {
                "draft_matches": 0,
                "issue_number": 1,
                "issue_status_label": False,
            }
        )

        self.assertEqual(2, result.returncode)
        self.assertIn("issue_status_label은 문자열이어야 합니다", result.stderr)

    def test_issue_lifecycle_script_selects_ready_issue_delivery(self) -> None:
        result = self._run_with_json(
            "plan-issue-lifecycle",
            {"issue_number": 14, "issue_status": "status:ready"},
        )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("cf-issue-workflow", json.loads(result.stdout)["skill"])

    def test_post_merge_cleanup_script_blocks_unmerged_pr(self) -> None:
        result = self._run_with_json(
            "plan-post-merge-cleanup",
            {
                "issue_number": 14,
                "issue_state": "OPEN",
                "pr_state": "OPEN",
                "head_branch": "CF-14",
                "base_branch": "develop",
                "merge_commit": None,
                "merge_in_origin_develop": False,
                "local_branch_exists": True,
                "worktrees": [],
            },
        )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("blocked", json.loads(result.stdout)["status"])

    def test_shell_syntax_script_runs_with_selected_shell(self) -> None:
        result = self._run("validate-shell-syntax")

        self.assertEqual(0, result.returncode, result.stderr)

    def test_guard_script_denies_destructive_command(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self._init_issue_repository(directory)
            payload = json.dumps(
                {
                    "cwd": directory,
                    "tool_name": "Bash",
                    "tool_input": {"command": "rm -rf build"},
                }
            )

            result = self._run("guard-tool-use", input_text=payload)

        output = json.loads(result.stdout)
        decision = output["hookSpecificOutput"]
        self.assertEqual("deny", decision["permissionDecision"])
        self.assertIn("삭제 명령", decision["permissionDecisionReason"])

    def test_guard_script_allows_safe_command_without_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self._init_issue_repository(directory)
            payload = json.dumps(
                {
                    "cwd": directory,
                    "tool_name": "Bash",
                    "tool_input": {"command": "python3 -m unittest"},
                }
            )

            result = self._run("guard-tool-use", input_text=payload)

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("", result.stdout)

    def test_guard_script_denies_when_branch_cannot_be_resolved(self) -> None:
        payload = json.dumps(
            {
                "cwd": "/path/that/does/not/exist",
                "tool_name": "Bash",
                "tool_input": {"command": "python3 -m unittest"},
            }
        )

        result = self._run("guard-tool-use", input_text=payload)

        output = json.loads(result.stdout)
        decision = output["hookSpecificOutput"]
        self.assertEqual("deny", decision["permissionDecision"])
        self.assertIn("브랜치", decision["permissionDecisionReason"])

    def _run(
        self, script: str, *arguments: str, input_text: str | None = None
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            (sys.executable, str(SCRIPTS / f"{script}.py"), *arguments),
            cwd=ROOT,
            input=input_text,
            capture_output=True,
            text=True,
            check=False,
        )

    def _init_issue_repository(self, directory: str) -> None:
        subprocess.run(
            ("git", "init", "-q", "-b", "CF-123"),
            cwd=directory,
            check=True,
        )

    def _run_project_issue_plan(
        self, payload: dict[str, object]
    ) -> subprocess.CompletedProcess[str]:
        return self._run_with_json("plan-project-issue", payload)

    def _run_with_json(
        self, script: str, payload: dict[str, object]
    ) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory) / "snapshot.json"
            snapshot.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            return self._run(script, str(snapshot))

    def _valid_issue_body(self) -> str:
        return """## 배경
사이트마다 입력 구조가 다르다.
## 목표
필드를 안전하게 입력한다.
## 포함 범위
- 필드 매핑
## 제외 범위
- 실제 제출
## 인수 조건
- [ ] 필드가 한 번 입력된다
## 자동 검증
- 단위 테스트
## 수동 검증
- 개발 서버 확인
## 위험 작업
- 없음
"""

if __name__ == "__main__":
    unittest.main()
