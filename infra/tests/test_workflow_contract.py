import re
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"


class WorkflowContractTest(unittest.TestCase):
    def test_backend_ci_runs_gradle_contract_on_pull_requests(self) -> None:
        workflow = self._workflow("backend-ci.yml")

        self.assertIn("pull_request", workflow["on"])
        job = workflow["jobs"]["backend"]
        self.assertEqual("ubuntu-latest", job["runs-on"])
        build_step = next(
            step for step in job["steps"] if "./gradlew" in step.get("run", "")
        )
        self.assertEqual("backend", build_step["working-directory"])
        self.assertIn("clean check bootJar", build_step["run"])
        self.assertNotIn("self-hosted", str(workflow))

    def test_development_and_staging_build_arm64_then_deploy_digest(self) -> None:
        cases = (
            ("deploy-development.yml", "develop", "development", "dev"),
            ("deploy-staging.yml", "release/**", "staging", "staging"),
        )

        for filename, branch, environment, profile in cases:
            with self.subTest(filename=filename):
                workflow = self._workflow(filename)
                self.assertEqual(
                    [branch], workflow["on"]["push"]["branches"], filename
                )
                build = workflow["jobs"]["build"]
                deploy = workflow["jobs"]["deploy"]
                image_step = next(
                    step
                    for step in build["steps"]
                    if step.get("id") == "image"
                )

                self.assertEqual(
                    "${{ steps.image.outputs.digest }}", build["outputs"]["digest"]
                )
                self.assertEqual("linux/arm64", image_step["with"]["platforms"])
                self.assertEqual("true", image_step["with"]["push"])
                expected_sha = "${{ github.sha }}"
                self.assertIn(expected_sha, image_step["with"]["tags"])
                self.assertEqual(
                    ["self-hosted", "linux", "ARM64", environment],
                    deploy["runs-on"],
                )
                self.assertEqual(environment, deploy["environment"])
                self.assertEqual(
                    f"deploy-{environment}", deploy["concurrency"]["group"]
                )
                self.assertEqual("false", deploy["concurrency"]["cancel-in-progress"])
                self.assertEqual(profile, deploy["env"]["SPRING_PROFILES_ACTIVE"])
                self.assertEqual(
                    "${{ vars.DOCKERHUB_IMAGE }}@${{ needs.build.outputs.digest }}",
                    deploy["env"]["BACKEND_IMAGE"],
                )
                checkout = next(
                    step
                    for step in deploy["steps"]
                    if step.get("uses", "").startswith("actions/checkout@")
                )
                self.assertEqual(expected_sha, checkout["with"]["ref"])
                self.assertIn("infra/scripts/deploy.sh", deploy["steps"][-1]["run"])

    def test_start_release_creates_one_release_branch_and_draft_pr(self) -> None:
        workflow = self._workflow("start-release.yml")

        release_input = workflow["on"]["workflow_dispatch"]["inputs"]["version"]
        self.assertEqual("true", release_input["required"])
        self.assertEqual("write", workflow["permissions"]["contents"])
        self.assertEqual("write", workflow["permissions"]["pull-requests"])
        self.assertEqual("write", workflow["permissions"]["actions"])
        self.assertEqual("start-release", workflow["concurrency"]["group"])
        self.assertEqual("false", workflow["concurrency"]["cancel-in-progress"])
        script = "\n".join(
            step.get("run", "") for step in workflow["jobs"]["start"]["steps"]
        )
        self.assertIn(
            "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$",
            script,
        )
        self.assertIn("refs/heads/release/", script)
        self.assertIn("git switch --create", script)
        self.assertIn("origin/develop", script)
        self.assertIn("gh pr create", script)
        self.assertIn("--draft", script)
        self.assertIn("--base main", script)
        self.assertIn("--body-file", script)
        self.assertIn("gh workflow run deploy-staging.yml", script)
        self.assertIn('--ref "$branch"', script)
        self.assertNotIn("commit_sha", script)
        for section in (
            "해결하려는 문제가 무엇인가요?",
            "왜 해야 하나요?",
            "어떻게 해결했나요?",
            "이 PR의 한계 & 트레이드오프",
            "기존 기능에 미치는 영향",
            "Edge Case & 실패 시나리오",
            "검토한 대안과 선택 이유",
            "리뷰 포인트 (파일/영역별 Risk 🔴🟡🟢)",
        ):
            self.assertIn(section, script)

    def test_dispatched_staging_deploy_uses_the_dispatched_release_ref_sha(self) -> None:
        workflow = self._workflow("deploy-staging.yml")

        self.assertIn("workflow_dispatch", workflow["on"])
        self.assertNotIn("paths", workflow["on"]["push"])
        build = workflow["jobs"]["build"]
        checkout = next(
            step
            for step in build["steps"]
            if step.get("uses", "").startswith("actions/checkout@")
        )
        image = next(step for step in build["steps"] if step.get("id") == "image")
        deploy_checkout = next(
            step
            for step in workflow["jobs"]["deploy"]["steps"]
            if step.get("uses", "").startswith("actions/checkout@")
        )
        self.assertEqual("${{ github.sha }}", checkout["with"]["ref"])
        self.assertIn("${{ github.sha }}", image["with"]["tags"])
        self.assertEqual("${{ github.sha }}", deploy_checkout["with"]["ref"])

    def test_production_reuses_release_digest_and_builds_hotfix(self) -> None:
        workflow = self._workflow("deploy-production.yml")

        self.assertEqual(["main"], workflow["on"]["push"]["branches"])
        classify_script = "\n".join(
            step.get("run", "")
            for step in workflow["jobs"]["classify"]["steps"]
        )
        self.assertIn("commits/${GITHUB_SHA}/pulls", classify_script)
        self.assertIn("classify-main-merge.py", classify_script)

        image = workflow["jobs"]["image"]
        release = next(step for step in image["steps"] if step.get("id") == "release")
        hotfix = next(step for step in image["steps"] if step.get("id") == "hotfix")
        self.assertIn("needs.classify.outputs.head_sha", release["env"]["IMAGE_TAG"])
        self.assertIn("imagetools inspect", release["run"])
        self.assertEqual("linux/arm64", hotfix["with"]["platforms"])
        self.assertEqual("true", hotfix["with"]["push"])
        self.assertIn("${{ github.sha }}", hotfix["with"]["tags"])

        deploy = workflow["jobs"]["deploy"]
        self.assertEqual(
            ["self-hosted", "linux", "ARM64", "production"], deploy["runs-on"]
        )
        self.assertEqual("production", deploy["environment"])
        self.assertEqual("prod", deploy["env"]["SPRING_PROFILES_ACTIVE"])
        self.assertIn("kind != 'revert'", deploy["if"])
        checkout = next(
            step
            for step in deploy["steps"]
            if step.get("uses", "").startswith("actions/checkout@")
        )
        self.assertEqual("${{ github.sha }}", checkout["with"]["ref"])

    def test_production_failure_creates_draft_revert_pr(self) -> None:
        workflow = self._workflow("deploy-production.yml")
        revert = workflow["jobs"]["revert"]
        script = "\n".join(step.get("run", "") for step in revert["steps"])

        self.assertIn("needs.deploy.outputs.attempted == 'true'", revert["if"])
        self.assertIn("needs.deploy.result == 'failure'", revert["if"])
        self.assertNotIn("needs.image.result == 'failure'", revert["if"])
        self.assertEqual("write", revert["permissions"]["contents"])
        self.assertEqual("write", revert["permissions"]["pull-requests"])
        self.assertIn("revert/${GITHUB_SHA}", script)
        self.assertIn("git revert --no-edit -m 1", script)
        self.assertIn("git revert --no-edit", script)
        self.assertIn("gh pr create", script)
        self.assertIn("--draft", script)
        self.assertIn("--base main", script)
        self.assertIn("kind != 'revert'", revert["if"])

    def test_release_production_deploy_validates_the_merged_source_tree(self) -> None:
        workflow = self._workflow("deploy-production.yml")
        image = workflow["jobs"]["image"]
        script = "\n".join(step.get("run", "") for step in image["steps"])
        gradle_step = next(
            step for step in image["steps"] if "./gradlew" in step.get("run", "")
        )

        self.assertIn("needs.classify.outputs.head_sha", script)
        self.assertIn("git diff --quiet", script)
        self.assertIn("^{tree}", script)
        self.assertIn("clean check bootJar", gradle_step["run"])
        self.assertNotIn("if", gradle_step)

    def test_successful_production_deploy_creates_sync_metadata(self) -> None:
        workflow = self._workflow("deploy-production.yml")
        release = workflow["jobs"]["release-success"]
        hotfix = workflow["jobs"]["hotfix-success"]
        release_script = "\n".join(
            step.get("run", "") for step in release["steps"]
        )
        hotfix_script = "\n".join(
            step.get("run", "") for step in hotfix["steps"]
        )

        self.assertIn("needs.deploy.result == 'success'", release["if"])
        self.assertIn("git tag", release_script)
        self.assertIn("--base develop", release_script)
        self.assertIn("--head", release_script)
        self.assertIn("needs.deploy.result == 'success'", hotfix["if"])
        self.assertIn("--head main", hotfix_script)
        self.assertIn('gh pr create --base "$base" --head main', hotfix_script)
        self.assertIn("create_sync_pr develop", hotfix_script)
        self.assertIn('startswith("release/")', hotfix_script)

    def test_release_sync_merge_deletes_release_branch(self) -> None:
        workflow = self._workflow("complete-release-sync.yml")

        self.assertEqual(
            ["closed"], workflow["on"]["pull_request"]["types"]
        )
        self.assertEqual(
            ["develop"], workflow["on"]["pull_request"]["branches"]
        )
        cleanup = workflow["jobs"]["cleanup"]
        script = "\n".join(step.get("run", "") for step in cleanup["steps"])
        self.assertIn("pull_request.merged == true", cleanup["if"])
        self.assertIn("release/", cleanup["if"])
        self.assertIn("--method DELETE", script)
        self.assertIn("git/refs/heads/release/", script)

    def test_new_workflows_pin_external_actions_to_full_commit_sha(self) -> None:
        for filename in (
            "backend-ci.yml",
            "deploy-development.yml",
            "start-release.yml",
            "deploy-staging.yml",
            "deploy-production.yml",
            "complete-release-sync.yml",
        ):
            workflow = self._workflow(filename)
            for job in workflow["jobs"].values():
                for step in job.get("steps", []):
                    uses = step.get("uses")
                    if uses:
                        with self.subTest(filename=filename, uses=uses):
                            self.assertRegex(uses, r"^[^@]+@[0-9a-f]{40}$")

    def _workflow(self, filename: str) -> dict[str, object]:
        path = WORKFLOWS / filename
        self.assertTrue(path.is_file(), filename)
        value = yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
        self.assertIsInstance(value, dict)
        return value


if __name__ == "__main__":
    unittest.main()
