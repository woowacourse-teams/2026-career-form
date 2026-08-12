import tempfile
import unittest
from pathlib import Path

from harness.lib.skill_inventory import validate_skill_inventory


ROOT = Path(__file__).resolve().parents[2]


class SkillInventoryTest(unittest.TestCase):
    def test_accepts_vendored_project_skills(self) -> None:
        result = validate_skill_inventory(ROOT / ".agents" / "skills")

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_external_skill_without_upstream_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "external-skill"
            skill.mkdir()
            (skill / "SKILL.md").write_text("---\nname: external-skill\n---\n")

            result = validate_skill_inventory(root)

        self.assertIn(
            "외부 스킬 메타데이터가 없습니다: external-skill/UPSTREAM.json",
            result.errors,
        )

    def test_accepts_repository_owned_project_access_skill(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "github-project-onboarding"
            skill.mkdir()
            (skill / "SKILL.md").write_text(
                "---\n"
                "name: github-project-onboarding\n"
                "description: GitHub Project 접근 문제를 진단한다.\n"
                "---\n",
                encoding="utf-8",
            )

            result = validate_skill_inventory(root)

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_repository_owned_project_issue_planning_skill(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "project-issue-planning"
            skill.mkdir()
            (skill / "SKILL.md").write_text(
                "---\n"
                "name: project-issue-planning\n"
                "description: Project draft를 작업 Issue로 구체화한다.\n"
                "---\n",
                encoding="utf-8",
            )

            result = validate_skill_inventory(root)

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_skill_with_invalid_frontmatter(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "issue-workflow"
            skill.mkdir()
            (skill / "SKILL.md").write_text("name: issue-workflow\n", encoding="utf-8")

            result = validate_skill_inventory(root)

        self.assertIn("스킬 frontmatter가 올바르지 않습니다: issue-workflow", result.errors)

    def test_rejects_skill_name_that_differs_from_folder(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "issue-workflow"
            skill.mkdir()
            (skill / "SKILL.md").write_text(
                "---\nname: another-skill\ndescription: 설명\n---\n",
                encoding="utf-8",
            )

            result = validate_skill_inventory(root)

        self.assertIn(
            "스킬 name이 폴더 이름과 다릅니다: issue-workflow",
            result.errors,
        )


if __name__ == "__main__":
    unittest.main()
