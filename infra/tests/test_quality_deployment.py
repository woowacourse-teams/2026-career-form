import json
import os
import subprocess
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
IMAGE = "registry.example/career-form@sha256:" + "a" * 64
DEFAULTS = {
    "SERVER_FORWARD_HEADERS_STRATEGY": "none",
    "CAREER_FORM_QUALITY_ENABLED": "false",
    "CAREER_FORM_QUALITY_PASSWORD_HASH": "",
    "CAREER_FORM_QUALITY_QUERY_TOKEN_HASH": "",
    "CAREER_FORM_QUALITY_MANAGEMENT_URL": "",
    "CAREER_FORM_QUALITY_DISCORD_ENABLED": "false",
    "CAREER_FORM_QUALITY_DISCORD_ENVIRONMENT": "prod",
    "CAREER_FORM_QUALITY_DISCORD_WEBHOOK": "",
    "CAREER_FORM_QUALITY_SELECTION_DAYS": "7",
    "CAREER_FORM_QUALITY_SELECTION_MINIMUM_SAMPLE": "20",
}
SECRETS = {
    "CAREER_FORM_QUALITY_PASSWORD_HASH",
    "CAREER_FORM_QUALITY_QUERY_TOKEN_HASH",
    "CAREER_FORM_QUALITY_DISCORD_WEBHOOK",
}


class QualityDeploymentTest(unittest.TestCase):
    def render(self, profile, settings, image=IMAGE):
        environment = {key: value for key, value in os.environ.items() if not key.startswith("CAREER_FORM_QUALITY_") and key not in DEFAULTS}
        environment.update({"BACKEND_IMAGE": image, "BACKEND_PORT": "18081",
            "SPRING_PROFILES_ACTIVE": profile, "SPRING_MONGODB_URI": "mongodb://synthetic.invalid/quality",
            "OPENAI_API_KEY": "synthetic-openai-key", **settings})
        result = subprocess.run(("docker", "compose", "--project-name", "quality-deployment-test", "--env-file", "/dev/null",
            "-f", str(ROOT / "compose.yaml"), "-f", str(ROOT / "infra/compose.deploy.yaml"), "config", "--format", "json"),
            cwd=ROOT, env=environment, text=True, capture_output=True, check=False)
        self.assertEqual(0, result.returncode, "Synthetic Compose configuration failed")
        rendered = json.loads(result.stdout)["services"]["backend"]["environment"]
        return {key: value.replace("$$", "$") if isinstance(value, str) else value for key, value in rendered.items()}

    def test_missing_and_empty_quality_settings_preserve_disabled_defaults(self):
        for profile in ("dev", "staging", "prod"):
            for settings in ({}, dict.fromkeys(DEFAULTS, "")):
                with self.subTest(profile=profile, empty=bool(settings)):
                    runtime = self.render(profile, settings)
                    for key, value in DEFAULTS.items():
                        self.assertEqual(value, runtime.get(key), key)

    def test_injected_quality_settings_reach_each_runtime_without_altering_existing_settings(self):
        settings = {"CAREER_FORM_QUALITY_ENABLED": "true", "SERVER_FORWARD_HEADERS_STRATEGY": "framework",
            "CAREER_FORM_QUALITY_PASSWORD_HASH": "pbkdf2-sha256$600000$synthetic-salt$synthetic-digest",
            "CAREER_FORM_QUALITY_QUERY_TOKEN_HASH": "b" * 64,
            "CAREER_FORM_QUALITY_MANAGEMENT_URL": "http://synthetic.test/quality/",
            "CAREER_FORM_QUALITY_DISCORD_ENABLED": "true", "CAREER_FORM_QUALITY_DISCORD_ENVIRONMENT": "staging",
            "CAREER_FORM_QUALITY_DISCORD_WEBHOOK": "https://discord.invalid/synthetic-webhook",
            "CAREER_FORM_QUALITY_SELECTION_DAYS": "14", "CAREER_FORM_QUALITY_SELECTION_MINIMUM_SAMPLE": "30"}
        for profile in ("dev", "staging", "prod"):
            with self.subTest(profile=profile):
                runtime = self.render(profile, settings)
                for key, value in settings.items():
                    self.assertEqual(value, runtime.get(key), key)
                self.assertEqual(profile, runtime["SPRING_PROFILES_ACTIVE"])
                self.assertEqual("synthetic-openai-key", runtime["OPENAI_API_KEY"])
                self.assertEqual("mongodb://synthetic.invalid/quality", runtime["SPRING_MONGODB_URI"])

    def test_quality_version_follows_current_image_even_when_rolling_back(self):
        previous = "registry.example/career-form@sha256:" + "c" * 64
        for image in (IMAGE, previous):
            with self.subTest(image=image):
                runtime = self.render("prod", {"CAREER_FORM_QUALITY_VERSION": "stale-manual-version"}, image)
                self.assertEqual(image, runtime.get("CAREER_FORM_QUALITY_VERSION"))

    def test_all_deploy_workflows_inject_quality_configuration_only_at_runtime(self):
        for filename in ("deploy-development.yml", "deploy-staging.yml", "deploy-production.yml"):
            with self.subTest(filename=filename):
                workflow = yaml.load((ROOT / ".github/workflows" / filename).read_text(), Loader=yaml.BaseLoader)
                deploy = workflow["jobs"]["deploy"]
                for key in DEFAULTS:
                    source = "secrets" if key in SECRETS else "vars"
                    self.assertEqual("${{ " + source + "." + key + " }}", deploy["env"].get(key), key)
                    self.assertNotIn(key, workflow.get("env", {}))
                    for name, job in workflow["jobs"].items():
                        if name != "deploy":
                            self.assertNotIn(key, str(job))
                self.assertNotIn("CAREER_FORM_QUALITY_VERSION", deploy["env"])

    @unittest.skipUnless(os.environ.get("RUN_QUALITY_DEPLOYMENT_INTEGRATION") == "1", "Explicit synthetic container environment test")
    def test_password_verifier_is_delivered_literally_to_container(self):
        verifier = "pbkdf2-sha256$600000$synthetic-salt$synthetic-digest"
        environment = {key: value for key, value in os.environ.items() if not key.startswith("CAREER_FORM_QUALITY_") and key not in DEFAULTS}
        environment.update({"BACKEND_IMAGE": os.environ.get("QUALITY_DEPLOYMENT_TEST_IMAGE", "python:3.13-alpine"),
            "BACKEND_PORT": "18081", "SPRING_PROFILES_ACTIVE": "prod",
            "SPRING_MONGODB_URI": "mongodb://synthetic.invalid/quality", "OPENAI_API_KEY": "synthetic-openai-key",
            "CAREER_FORM_QUALITY_ENABLED": "true", "CAREER_FORM_QUALITY_PASSWORD_HASH": verifier})
        program = "import os; assert os.environ['CAREER_FORM_QUALITY_PASSWORD_HASH'] == " + repr(verifier)
        result = subprocess.run(("docker", "compose", "--project-name", "quality-deployment-test", "--env-file", "/dev/null",
            "-f", str(ROOT / "compose.yaml"), "-f", str(ROOT / "infra/compose.deploy.yaml"),
            "run", "--rm", "--no-deps", "-T", "--entrypoint", "python3", "backend", "-c", program),
            cwd=ROOT, env=environment, text=True, capture_output=True, check=False, timeout=90)
        self.assertEqual(0, result.returncode, "Synthetic container did not receive the literal verifier")

    def test_proxy_header_strategy_is_opt_in_for_each_runtime(self):
        for profile in ("dev", "staging", "prod"):
            for strategy in ("native", "framework"):
                with self.subTest(profile=profile, strategy=strategy):
                    runtime = self.render(profile, {"SERVER_FORWARD_HEADERS_STRATEGY": strategy})
                    self.assertEqual(strategy, runtime.get("SERVER_FORWARD_HEADERS_STRATEGY"))
