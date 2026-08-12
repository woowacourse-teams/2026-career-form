import json
import tomllib
import unittest
from pathlib import Path

import yaml

from harness.lib.issue_contract import REQUIRED_SECTIONS as ISSUE_SECTIONS
from harness.lib.markdown_sections import extract_sections
from harness.lib.pr_contract import REQUIRED_SECTIONS as PR_SECTIONS


ROOT = Path(__file__).resolve().parents[2]


class RepositoryContractTest(unittest.TestCase):
    def test_issue_forms_do_not_define_default_titles(self) -> None:
        template_root = ROOT / ".github" / "ISSUE_TEMPLATE"

        for name in ("feature.yml", "bug.yml", "technical-task.yml"):
            form = self._yaml(template_root / name)

            self.assertNotIn("title", form, name)

    def test_issue_forms_supply_validator_sections(self) -> None:
        template_root = ROOT / ".github" / "ISSUE_TEMPLATE"

        for name in ("feature.yml", "bug.yml", "technical-task.yml"):
            form = self._yaml(template_root / name)
            labels = form.get("labels", [])
            body = form.get("body", [])
            section_labels = {
                item.get("attributes", {}).get("label")
                for item in body
                if isinstance(item, dict)
            }
            self.assertIn("status:planning", labels, name)
            self.assertTrue(set(ISSUE_SECTIONS).issubset(section_labels), name)

    def test_pr_template_supplies_validator_sections(self) -> None:
        body = (ROOT / ".github" / "pull_request_template.md").read_text(
            encoding="utf-8"
        )

        self.assertEqual(
            (
                "해결하려는 문제가 무엇인가요?",
                "왜 해야 하나요?",
                "어떻게 해결했나요?",
                "이 PR의 한계 & 트레이드오프",
                "기존 기능에 미치는 영향",
                "Edge Case & 실패 시나리오",
                "검토한 대안과 선택 이유",
                "리뷰 포인트 (파일/영역별 Risk 🔴🟡🟢)",
            ),
            PR_SECTIONS,
        )
        self.assertTrue(set(PR_SECTIONS).issubset(extract_sections(body)))

    def test_workflows_are_valid_yaml_mappings(self) -> None:
        workflow_root = ROOT / ".github" / "workflows"

        for path in workflow_root.glob("*.yml"):
            self.assertIsInstance(self._yaml(path), dict, path.name)

    def test_all_repository_yaml_files_are_valid(self) -> None:
        paths = sorted((*ROOT.rglob("*.yml"), *ROOT.rglob("*.yaml")))

        for path in paths:
            if ".git" in path.parts or ".venv" in path.parts:
                continue
            self.assertIsInstance(self._yaml(path), dict, str(path.relative_to(ROOT)))

    def test_codex_config_enables_project_hooks(self) -> None:
        config = tomllib.loads(
            (ROOT / ".codex" / "config.toml").read_text(encoding="utf-8")
        )

        self.assertEqual("on-request", config["approval_policy"])
        self.assertEqual("workspace-write", config["sandbox_mode"])
        self.assertTrue(config["features"]["hooks"])

    def test_codex_hook_guards_shell_and_file_writes(self) -> None:
        hooks = json.loads(
            (ROOT / ".codex" / "hooks.json").read_text(encoding="utf-8")
        )
        matcher = hooks["hooks"]["PreToolUse"][0]["matcher"]

        self.assertEqual("^.*$", matcher)

    def test_verify_covers_syntax_skills_and_execpolicy(self) -> None:
        verify = (ROOT / "harness" / "scripts" / "verify").read_text(
            encoding="utf-8"
        )

        self.assertIn('"compileall"', verify)
        self.assertIn('"validate-shell-syntax"', verify)
        self.assertIn('"validate-skills"', verify)
        self.assertIn('"validate-execpolicy"', verify)

    def test_quality_gate_installs_pinned_codex_cli(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "quality-gate.yml").read_text(
            encoding="utf-8"
        )

        self.assertIn("@openai/codex@0.146.0", workflow)

    def test_default_worktree_directory_is_ignored(self) -> None:
        patterns = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()

        self.assertIn(".worktrees/", patterns)

    def test_issue_contract_runs_for_ready_labels_and_edits(self) -> None:
        workflow = self._yaml(ROOT / ".github" / "workflows" / "issue-contract.yml")
        issue_events = workflow["on"]["issues"]["types"]

        self.assertEqual(["labeled", "edited"], issue_events)

    def test_shared_file_contract_reruns_when_pr_body_is_edited(self) -> None:
        workflow = self._yaml(ROOT / ".github" / "workflows" / "shared-files.yml")
        pull_request_events = workflow["on"]["pull_request"]["types"]

        self.assertIn("edited", pull_request_events)

    def test_shared_file_contract_reads_current_pr_state(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "shared-files.yml").read_text(
            encoding="utf-8"
        )

        self.assertIn("gh pr view", workflow)
        self.assertIn("current-pr.json", workflow)

    def _yaml(self, path: Path) -> dict[str, object]:
        value = yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
        self.assertIsInstance(value, dict, path.name)
        return value


if __name__ == "__main__":
    unittest.main()
