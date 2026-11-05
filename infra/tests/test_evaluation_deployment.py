import json
import os
import subprocess
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
IMAGE = "registry.example/career-form@sha256:" + "a" * 64
DEFAULTS = {
    "CAREER_FORM_EVALUATION_ENABLED": "false",
    "CAREER_FORM_EVALUATION_AUTO_RUN_ENABLED": "false",
    "CAREER_FORM_EVALUATION_OPENAI_ENABLED": "false",
    "CAREER_FORM_EVALUATION_PROVIDER_KEYS": "",
}
SECRETS = {"CAREER_FORM_EVALUATION_PROVIDER_KEYS"}
SYNTHETIC = {
    "CAREER_FORM_EVALUATION_ENABLED": "true",
    "CAREER_FORM_EVALUATION_AUTO_RUN_ENABLED": "true",
    "CAREER_FORM_EVALUATION_OPENAI_ENABLED": "true",
    "CAREER_FORM_EVALUATION_PROVIDER_KEYS": "synthetic=synthetic-key@api.example.invalid",
}


class EvaluationDeploymentTest(unittest.TestCase):
    def render(self, profile, settings):
        environment = {key: value for key, value in os.environ.items() if not key.startswith("CAREER_FORM_EVALUATION_")}
        environment.update({"BACKEND_IMAGE": IMAGE, "BACKEND_PORT": "18081",
            "SPRING_PROFILES_ACTIVE": profile, "SPRING_MONGODB_URI": "mongodb://synthetic.invalid/evaluation",
            "OPENAI_API_KEY": "synthetic-openai-key", **settings})
        result = subprocess.run(("docker", "compose", "--project-name", "evaluation-deployment-test", "--env-file", "/dev/null",
            "-f", str(ROOT / "compose.yaml"), "-f", str(ROOT / "infra/compose.deploy.yaml"), "config", "--format", "json"),
            cwd=ROOT, env=environment, text=True, capture_output=True, check=False)
        self.assertEqual(0, result.returncode, result.stderr)
        return json.loads(result.stdout)["services"]["backend"]["environment"]

    def test_missing_and_empty_evaluation_settings_keep_the_feature_disabled(self):
        for profile in ("dev", "staging", "prod"):
            for settings in ({}, dict.fromkeys(DEFAULTS, "")):
                with self.subTest(profile=profile, empty=bool(settings)):
                    runtime = self.render(profile, settings)
                    for key, value in DEFAULTS.items():
                        self.assertEqual(value, runtime.get(key), key)

    def test_injected_evaluation_settings_reach_the_runtime(self):
        runtime = self.render("dev", SYNTHETIC)
        for key, value in SYNTHETIC.items():
            self.assertEqual(value, runtime.get(key), key)
        self.assertEqual("synthetic-openai-key", runtime["OPENAI_API_KEY"])

    def test_only_the_development_workflow_injects_evaluation_settings(self):
        workflow = yaml.load((ROOT / ".github/workflows/deploy-development.yml").read_text(), Loader=yaml.BaseLoader)
        deploy = workflow["jobs"]["deploy"]
        for key in DEFAULTS:
            source = "secrets" if key in SECRETS else "vars"
            self.assertEqual("${{ " + source + "." + key + " }}", deploy["env"].get(key), key)
            self.assertNotIn(key, str(workflow["jobs"]["build"]))
        for filename in ("deploy-staging.yml", "deploy-production.yml"):
            with self.subTest(filename=filename):
                self.assertNotIn("CAREER_FORM_EVALUATION_", (ROOT / ".github/workflows" / filename).read_text())

    def test_development_image_carries_its_commit_and_adapter_digest(self):
        workflow = yaml.load((ROOT / ".github/workflows/deploy-development.yml").read_text(), Loader=yaml.BaseLoader)
        steps = workflow["jobs"]["build"]["steps"]
        image = next(step for step in steps if step.get("id") == "image")
        self.assertEqual(["CAREER_FORM_COMMIT=${{ github.sha }}", "CAREER_FORM_ADAPTER_DIGEST=${{ steps.adapter.outputs.digest }}"],
            image["with"]["build-args"].strip().splitlines())
        adapter = next(step for step in steps if step.get("id") == "adapter")
        self.assertIn("git rev-parse HEAD:backend/src/main/java/com/careerform/formanalysis/infrastructure/adapter", adapter["run"])
        self.assertLess(steps.index(adapter), steps.index(image))
        dockerfile = (ROOT / "backend/Dockerfile").read_text(encoding="utf-8")
        runtime = dockerfile[dockerfile.rindex("FROM "):]
        self.assertRegex(runtime, r"(?m)^ARG CAREER_FORM_COMMIT=$")
        self.assertRegex(runtime, r"(?m)^ENV CAREER_FORM_COMMIT=\$\{CAREER_FORM_COMMIT\}$")
        self.assertRegex(runtime, r"(?m)^ARG CAREER_FORM_ADAPTER_DIGEST=$")
        self.assertRegex(runtime, r"(?m)^ENV CAREER_FORM_ADAPTER_DIGEST=\$\{CAREER_FORM_ADAPTER_DIGEST\}$")
        # 커밋 값이 바뀌어도 앞 레이어 캐시를 쓰도록 마지막 COPY 뒤에 둔다.
        self.assertLess(runtime.rindex("COPY "), runtime.index("ARG CAREER_FORM_COMMIT"))

    def test_deploy_script_does_not_require_evaluation_settings(self):
        script = (ROOT / "infra/scripts/deploy.sh").read_text(encoding="utf-8")
        self.assertNotIn("CAREER_FORM_EVALUATION_", script)
        self.assertNotIn("CAREER_FORM_COMMIT", script)


if __name__ == "__main__":
    unittest.main()
