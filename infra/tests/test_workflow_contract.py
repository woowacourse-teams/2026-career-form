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
                self.assertIn("${{ github.sha }}", image_step["with"]["tags"])
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
                self.assertEqual("${{ github.sha }}", checkout["with"]["ref"])
                self.assertIn("infra/scripts/deploy.sh", deploy["steps"][-1]["run"])

    def test_start_release_creates_one_release_branch_and_draft_pr(self) -> None:
        workflow = self._workflow("start-release.yml")

        release_input = workflow["on"]["workflow_dispatch"]["inputs"]["version"]
        self.assertEqual("true", release_input["required"])
        self.assertEqual("write", workflow["permissions"]["contents"])
        self.assertEqual("write", workflow["permissions"]["pull-requests"])
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

    def test_new_workflows_pin_external_actions_to_full_commit_sha(self) -> None:
        for filename in (
            "backend-ci.yml",
            "deploy-development.yml",
            "start-release.yml",
            "deploy-staging.yml",
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
