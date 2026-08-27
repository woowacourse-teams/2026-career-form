import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
SKILLS = ROOT / ".agents" / "skills"


class SkillGraphTest(unittest.TestCase):
    def test_repository_contains_only_expected_cf_skills(self) -> None:
        expected = {
            "cf-code-review",
            "cf-deep-interview",
            "cf-executing-plans",
            "cf-finishing-a-development-branch",
            "cf-github-project-onboarding",
            "cf-grill-me",
            "cf-grilling",
            "cf-issue-lifecycle",
            "cf-issue-workflow",
            "cf-karpathy-llm-wiki",
            "cf-llm-wiki-query",
            "cf-post-merge-cleanup",
            "cf-project-issue-planning",
            "cf-test-driven-development",
            "cf-using-git-worktrees",
            "cf-verification-before-completion",
            "cf-writing-plans",
        }

        actual = {path.name for path in SKILLS.iterdir() if path.is_dir()}

        self.assertEqual(expected, actual)

    def test_lifecycle_connects_planning_delivery_and_cleanup(self) -> None:
        self._assert_references(
            "cf-issue-lifecycle",
            "cf-project-issue-planning",
            "cf-issue-workflow",
            "cf-post-merge-cleanup",
        )

    def test_planning_connects_access_interview_and_grill(self) -> None:
        self._assert_references(
            "cf-project-issue-planning",
            "cf-github-project-onboarding",
            "cf-deep-interview",
            "cf-grill-me",
            "cf-issue-workflow",
        )

    def test_delivery_connects_all_implementation_stages(self) -> None:
        self._assert_references(
            "cf-issue-workflow",
            "cf-using-git-worktrees",
            "cf-writing-plans",
            "cf-executing-plans",
            "cf-test-driven-development",
            "cf-verification-before-completion",
            "cf-code-review",
            "cf-karpathy-llm-wiki",
        )

    def test_shared_lifecycle_has_no_local_plugin_dependency(self) -> None:
        names = (
            "cf-issue-lifecycle",
            "cf-project-issue-planning",
            "cf-issue-workflow",
            "cf-post-merge-cleanup",
            "cf-writing-plans",
            "cf-executing-plans",
            "cf-grill-me",
        )
        for name in names:
            metadata = self._frontmatter(name).get("metadata", {})
            with self.subTest(name=name):
                self.assertTrue(metadata.get("portable"))
                self.assertEqual([], metadata.get("external_dependencies"))

    def _assert_references(self, source: str, *targets: str) -> None:
        metadata = self._frontmatter(source).get("metadata", {})
        self.assertEqual(list(targets), metadata.get("calls"))

    def _frontmatter(self, name: str) -> dict[str, object]:
        content = (SKILLS / name / "SKILL.md").read_text(encoding="utf-8")
        _, frontmatter, _ = content.split("---", 2)
        value = yaml.safe_load(frontmatter)
        self.assertIsInstance(value, dict)
        return value


if __name__ == "__main__":
    unittest.main()
