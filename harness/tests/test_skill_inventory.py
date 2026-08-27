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
            skill = root / "cf-external-skill"
            skill.mkdir()
            (skill / "SKILL.md").write_text("---\nname: cf-external-skill\n---\n")

            result = validate_skill_inventory(root)

        self.assertIn(
            "외부 스킬 메타데이터가 없습니다: cf-external-skill/UPSTREAM.json",
            result.errors,
        )

    def test_accepts_repository_owned_project_access_skill(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "cf-github-project-onboarding"
            skill.mkdir()
            (skill / "SKILL.md").write_text(
                "---\n"
                "name: cf-github-project-onboarding\n"
                "description: GitHub Project 접근 문제를 진단한다.\n"
                "---\n",
                encoding="utf-8",
            )

            result = validate_skill_inventory(root)

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_repository_owned_project_issue_planning_skill(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "cf-project-issue-planning"
            skill.mkdir()
            (skill / "SKILL.md").write_text(
                "---\n"
                "name: cf-project-issue-planning\n"
                "description: Project draft를 작업 Issue로 구체화한다.\n"
                "---\n",
                encoding="utf-8",
            )

            result = validate_skill_inventory(root)

        self.assertTrue(result.is_valid, result.errors)

    def test_accepts_repository_owned_llm_wiki_query_skill(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "cf-llm-wiki-query"
            skill.mkdir()
            (skill / "SKILL.md").write_text(
                "---\n"
                "name: cf-llm-wiki-query\n"
                "description: 프로젝트 결정을 LLM Wiki 근거로 답한다.\n"
                "---\n",
                encoding="utf-8",
            )

            result = validate_skill_inventory(root)

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_skill_with_invalid_frontmatter(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "cf-issue-workflow"
            skill.mkdir()
            (skill / "SKILL.md").write_text("name: cf-issue-workflow\n", encoding="utf-8")

            result = validate_skill_inventory(root)

        self.assertIn("스킬 frontmatter가 올바르지 않습니다: cf-issue-workflow", result.errors)

    def test_rejects_skill_name_that_differs_from_folder(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "cf-issue-workflow"
            skill.mkdir()
            (skill / "SKILL.md").write_text(
                "---\nname: another-skill\ndescription: 설명\n---\n",
                encoding="utf-8",
            )

            result = validate_skill_inventory(root)

        self.assertIn(
            "스킬 name이 폴더 이름과 다릅니다: cf-issue-workflow",
            result.errors,
        )

    def test_rejects_repository_skill_without_cf_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "issue-workflow"
            skill.mkdir()
            (skill / "SKILL.md").write_text(
                "---\nname: issue-workflow\ndescription: 설명\n---\n",
                encoding="utf-8",
            )

            result = validate_skill_inventory(root)

        self.assertIn("저장소 스킬 이름은 cf-로 시작해야 합니다: issue-workflow", result.errors)

    def test_rejects_truncated_issue_workflow_description(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "cf-issue-workflow"
            skill.mkdir()
            (skill / "SKILL.md").write_text(
                "---\n"
                "name: cf-issue-workflow\n"
                "description: Issue #123 작업을 시작한다. Draft PR까지 진행해줘\n"
                "---\n",
                encoding="utf-8",
            )

            result = validate_skill_inventory(root)

        self.assertIn(
            "스킬 description 트리거가 손상되었습니다: cf-issue-workflow: #123",
            result.errors,
        )

    def test_rejects_eval_skill_name_that_differs_from_folder(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "cf-issue-lifecycle"
            (skill / "evals").mkdir(parents=True)
            (skill / "SKILL.md").write_text(
                "---\nname: cf-issue-lifecycle\ndescription: 설명\n---\n",
                encoding="utf-8",
            )
            (skill / "evals" / "evals.json").write_text(
                '{"skill_name": "issue-lifecycle", "evals": []}',
                encoding="utf-8",
            )

            result = validate_skill_inventory(root)

        self.assertIn(
            "스킬 eval 이름이 폴더와 다릅니다: cf-issue-lifecycle",
            result.errors,
        )


if __name__ == "__main__":
    unittest.main()
