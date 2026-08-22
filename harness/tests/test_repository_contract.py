import json
import os
import shutil
import subprocess
import tempfile
import tomllib
import unittest
from pathlib import Path

import yaml

from harness.lib.issue_contract import REQUIRED_SECTIONS as ISSUE_SECTIONS
from harness.lib.markdown_sections import extract_sections, extract_subsections
from harness.lib.pr_contract import (
    REQUIRED_SECTIONS as PR_SECTIONS,
    REQUIRED_VERIFICATION_SECTIONS as PR_VERIFICATION_SECTIONS,
)


ROOT = Path(__file__).resolve().parents[2]


class RepositoryContractTest(unittest.TestCase):
    def test_issue_forms_do_not_suggest_parent_or_sub_issues(self) -> None:
        for path in (ROOT / ".github" / "ISSUE_TEMPLATE").glob("*.yml"):
            with self.subTest(path=path.name):
                content = path.read_text(encoding="utf-8")
                self.assertNotIn("Parent Issue", content)
                self.assertNotIn("Sub-issue", content)

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

    def test_feature_form_has_no_jira_specific_input(self) -> None:
        form = self._yaml(ROOT / ".github" / "ISSUE_TEMPLATE" / "feature.yml")
        input_ids = {
            item.get("id")
            for item in form.get("body", [])
            if isinstance(item, dict)
        }

        self.assertNotIn("jira_issue_type", input_ids)

    def test_jira_runtime_files_are_absent(self) -> None:
        runtime_paths = (
            ROOT / ".github" / "workflows" / "create-jira-issue.yml",
            ROOT / "scripts" / "jira_issue_payload.mjs",
            ROOT / "scripts" / "jira_issue_payload.test.mjs",
        )

        self.assertFalse(
            any(path.exists() for path in runtime_paths),
            tuple(str(path.relative_to(ROOT)) for path in runtime_paths if path.exists()),
        )

    def test_pr_template_supplies_validator_sections(self) -> None:
        body = (ROOT / ".github" / "pull_request_template.md").read_text(
            encoding="utf-8"
        )

        self.assertEqual(
            (
                "무엇이 바뀌었나요?",
                "왜 바꿨나요?",
                "어떻게 바꿨나요?",
                "기존 기능에 미치는 영향",
                "검토한 대안과 선택 이유",
                "리뷰 포인트",
            ),
            PR_SECTIONS,
        )
        self.assertEqual(PR_SECTIONS, tuple(extract_sections(body)))
        self.assertEqual(
            PR_VERIFICATION_SECTIONS,
            tuple(extract_subsections(body)),
        )

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

    def test_python_entrypoints_have_py_extension(self) -> None:
        scripts = ROOT / "harness" / "scripts"
        extensionless_python = tuple(
            path.name
            for path in scripts.iterdir()
            if path.is_file()
            and path.suffix != ".py"
            and path.read_bytes().startswith(b"#!/usr/bin/env python3")
        )

        self.assertEqual((), extensionless_python)

    def test_git_hooks_invoke_python_scripts_through_an_interpreter(self) -> None:
        hooks = ROOT / ".githooks"

        for name in ("commit-msg", "pre-commit", "pre-push"):
            content = (hooks / name).read_text(encoding="utf-8")
            with self.subTest(name=name):
                self.assertIn("python-runtime.sh", content)
                self.assertNotRegex(content, r'exec "\$ROOT/harness/scripts/[^\"]+\.py"')

    def test_codex_and_github_hooks_do_not_execute_python_files_directly(self) -> None:
        hooks = (ROOT / ".codex" / "hooks.json").read_text(encoding="utf-8")
        workflows = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (ROOT / ".github" / "workflows").glob("*.yml")
        )

        self.assertIn('"command": "python3 ', hooks)
        self.assertNotRegex(workflows, r"(?m)^\s*run: harness/scripts/[^\s]+\.py")

    def test_git_hook_scripts_are_forced_to_lf(self) -> None:
        attributes = (ROOT / ".gitattributes").read_text(encoding="utf-8")

        self.assertIn(".githooks/** text eol=lf", attributes)
        self.assertIn("*.sh text eol=lf", attributes)
        for path in (ROOT / ".githooks").iterdir():
            if path.is_file():
                with self.subTest(path=path.name):
                    self.assertNotIn(b"\r\n", path.read_bytes())

    def test_harness_documents_wsl_linux_as_the_only_official_runtime(self) -> None:
        documents = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (ROOT / "AGENTS.md", ROOT / "harness" / "README.md")
        )

        self.assertIn("WSL/Linux", documents)
        self.assertIn("/home/", documents)
        self.assertIn("Windows PowerShell 직접 실행은 지원 대상이 아니다", documents)

    def test_verify_covers_syntax_skills_and_execpolicy(self) -> None:
        verify = (ROOT / "harness" / "scripts" / "verify.py").read_text(
            encoding="utf-8"
        )

        self.assertIn('"compileall"', verify)
        self.assertIn('"validate-shell-syntax.py"', verify)
        self.assertIn('"validate-skills.py"', verify)
        self.assertIn('"validate-execpolicy.py"', verify)

    def test_verify_runs_infrastructure_contract_tests(self) -> None:
        verify = (ROOT / "harness" / "scripts" / "verify.py").read_text(
            encoding="utf-8"
        )

        self.assertIn('"infra/tests"', verify)
        self.assertIn('"test_*.py"', verify)

    def test_shell_syntax_validation_covers_infrastructure_scripts(self) -> None:
        validator = (
            ROOT / "harness" / "scripts" / "validate-shell-syntax.py"
        ).read_text(encoding="utf-8")

        self.assertIn('ROOT / "infra" / "scripts"', validator)
        self.assertIn('glob("*.sh")', validator)

    def test_quality_gate_installs_pinned_codex_cli(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "quality-gate.yml").read_text(
            encoding="utf-8"
        )

        self.assertIn("@openai/codex@0.146.0", workflow)
        self.assertIn("python3 harness/scripts/verify.py", workflow)

    def test_default_worktree_directory_is_ignored(self) -> None:
        patterns = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()

        self.assertIn(".worktrees/", patterns)

    def test_llm_wiki_skill_tracks_pinned_mit_upstream(self) -> None:
        skill = ROOT / ".agents" / "skills" / "cf-karpathy-llm-wiki"
        metadata = json.loads((skill / "UPSTREAM.json").read_text(encoding="utf-8"))

        self.assertEqual("cf-karpathy-llm-wiki", skill.name)
        self.assertEqual("eafcc77001e496cc43499e4923b663aec722c813", metadata["commit"])
        self.assertEqual("MIT", metadata["license"])
        self.assertIn("MIT License", (skill / "LICENSE").read_text(encoding="utf-8"))

    def test_docs_contains_only_the_wiki_bridge(self) -> None:
        files = tuple(
            sorted(
                path.relative_to(ROOT / "docs").as_posix()
                for path in (ROOT / "docs").rglob("*")
                if path.is_file()
            )
        )

        self.assertEqual(("README.md",), files)
        self.assertTrue(
            (
                ROOT
                / "llm-wiki"
                / "raw"
                / "issues"
                / "CF-41"
                / "manifest.md"
            ).is_file()
        )

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

    def test_pr_contract_collects_linked_issue_title_without_label_events(self) -> None:
        workflow = self._yaml(ROOT / ".github" / "workflows" / "pr-contract.yml")
        pr_events = workflow["on"]["pull_request"]["types"]
        steps = workflow["jobs"]["validate"]["steps"]
        issue_steps = tuple(
            step
            for step in steps
            if "연결 Issue" in step.get("name", "")
        )
        self.assertNotIn("labeled", pr_events)
        self.assertNotIn("unlabeled", pr_events)
        self.assertEqual(1, len(issue_steps))
        issue_step = issue_steps[0]

        self.assertEqual("${{ github.token }}", issue_step["env"]["GH_TOKEN"])
        self.assertIn("^hotfix/CF-", issue_step["run"])
        self.assertIn("BASH_REMATCH", issue_step["run"])
        self.assertIn("--json title", issue_step["run"])
        self.assertNotIn("labels", issue_step["run"])

    def test_pr_contract_skips_issue_lookup_for_malformed_work_branch(self) -> None:
        workflow = self._yaml(ROOT / ".github" / "workflows" / "pr-contract.yml")
        issue_step = next(
            step
            for step in workflow["jobs"]["validate"]["steps"]
            if "연결 Issue" in step.get("name", "")
        )
        with tempfile.TemporaryDirectory() as runner_temp:
            environment = {
                **os.environ,
                "HEAD_REF": "hotfix/CF-not-a-number",
                "GITHUB_REPOSITORY": "owner/repository",
                "RUNNER_TEMP": runner_temp,
                "PATH": "",
            }
            shell = shutil.which("bash")
            self.assertIsNotNone(shell)
            result = subprocess.run(
                (shell, "-c", issue_step["run"]),
                check=False,
                capture_output=True,
                text=True,
                env=environment,
            )

        self.assertEqual(0, result.returncode, result.stderr)

    def test_pr_contract_revalidates_when_linked_issue_title_changes(self) -> None:
        workflow = self._yaml(ROOT / ".github" / "workflows" / "pr-contract.yml")
        self.assertIn("issues", workflow["on"])
        self.assertEqual(["edited"], workflow["on"]["issues"]["types"])
        self.assertIn("workflow_dispatch", workflow["on"])
        revalidate = workflow["jobs"]["revalidate"]
        run = revalidate["steps"][0]["run"]

        self.assertEqual("write", revalidate["permissions"]["actions"])
        self.assertIn('"CF-${{ github.event.issue.number }}"', run)
        self.assertIn('"hotfix/CF-${{ github.event.issue.number }}"', run)
        self.assertIn("gh workflow run", run)

    def _yaml(self, path: Path) -> dict[str, object]:
        value = yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
        self.assertIsInstance(value, dict, path.name)
        return value


if __name__ == "__main__":
    unittest.main()
