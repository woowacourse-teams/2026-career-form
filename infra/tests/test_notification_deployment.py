import json
import os
import re
import subprocess
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
IMAGE = "registry.example/career-form@sha256:" + "a" * 64
WORKFLOWS = ("deploy-development.yml", "deploy-staging.yml", "deploy-production.yml")
NOTIFICATION_PREFIXES = ("CAREER_FORM_NOTIFICATION_", "CAREER_FORM_PUSH_")
DEFAULTS = {
    "CAREER_FORM_NOTIFICATION_ENABLED": "false",
    "CAREER_FORM_PUSH_DISPATCH_INTERVAL": "60s",
    "CAREER_FORM_PUSH_CONCURRENCY": "20",
    "CAREER_FORM_PUSH_VAPID_PUBLIC_KEY": "",
    "CAREER_FORM_PUSH_VAPID_PRIVATE_KEY": "",
    "CAREER_FORM_PUSH_VAPID_SUBJECT": "",
}
SECRETS = {
    "CAREER_FORM_PUSH_VAPID_PUBLIC_KEY",
    "CAREER_FORM_PUSH_VAPID_PRIVATE_KEY",
    "CAREER_FORM_PUSH_VAPID_SUBJECT",
}
# base64url 모양의 합성 값: 공개키 87자(65바이트), 비공개키 43자(32바이트). 실제 키가 아니다.
SYNTHETIC = {
    "CAREER_FORM_NOTIFICATION_ENABLED": "true",
    "CAREER_FORM_PUSH_DISPATCH_INTERVAL": "30s",
    "CAREER_FORM_PUSH_CONCURRENCY": "5",
    "CAREER_FORM_PUSH_VAPID_PUBLIC_KEY": "BSynthetic-vapid_public-key_" + "A" * 59,
    "CAREER_FORM_PUSH_VAPID_PRIVATE_KEY": "synthetic-vapid_private-key_" + "b" * 15,
    "CAREER_FORM_PUSH_VAPID_SUBJECT": "mailto:synthetic@example.invalid",
}
DEPLOY_SCRIPT_REQUIRED = (
    "DEPLOY_ENVIRONMENT",
    "BACKEND_IMAGE",
    "BACKEND_PORT",
    "SPRING_PROFILES_ACTIVE",
    "SPRING_MONGODB_URI",
    "OPENAI_API_KEY",
)


class NotificationDeploymentTest(unittest.TestCase):
    def render(self, profile, settings):
        environment = {key: value for key, value in os.environ.items() if not key.startswith(NOTIFICATION_PREFIXES)}
        environment.update({"BACKEND_IMAGE": IMAGE, "BACKEND_PORT": "18081",
            "SPRING_PROFILES_ACTIVE": profile, "SPRING_MONGODB_URI": "mongodb://synthetic.invalid/notification",
            "OPENAI_API_KEY": "synthetic-openai-key", **settings})
        result = subprocess.run(("docker", "compose", "--project-name", "notification-deployment-test", "--env-file", "/dev/null",
            "-f", str(ROOT / "compose.yaml"), "-f", str(ROOT / "infra/compose.deploy.yaml"), "config", "--format", "json"),
            cwd=ROOT, env=environment, text=True, capture_output=True, check=False)
        self.assertEqual(0, result.returncode, result.stderr)
        rendered = json.loads(result.stdout)["services"]["backend"]["environment"]
        return {key: value.replace("$$", "$") if isinstance(value, str) else value for key, value in rendered.items()}

    def test_missing_and_empty_notification_settings_keep_the_feature_disabled(self):
        for profile in ("dev", "staging", "prod"):
            for settings in ({}, dict.fromkeys(DEFAULTS, "")):
                with self.subTest(profile=profile, empty=bool(settings)):
                    runtime = self.render(profile, settings)
                    for key, value in DEFAULTS.items():
                        self.assertEqual(value, runtime.get(key), key)

    def test_injected_notification_settings_reach_each_runtime_without_altering_existing_settings(self):
        for profile in ("dev", "staging", "prod"):
            with self.subTest(profile=profile):
                runtime = self.render(profile, SYNTHETIC)
                for key, value in SYNTHETIC.items():
                    self.assertEqual(value, runtime.get(key), key)
                self.assertEqual(profile, runtime["SPRING_PROFILES_ACTIVE"])
                self.assertEqual("mongodb://synthetic.invalid/notification", runtime["SPRING_MONGODB_URI"])
                self.assertEqual("synthetic-openai-key", runtime["OPENAI_API_KEY"])
                self.assertEqual("false", runtime["CAREER_FORM_LLM_ENABLED"])
                self.assertEqual("false", runtime["CAREER_FORM_QUALITY_ENABLED"])

    def test_all_deploy_workflows_inject_notification_settings_only_in_deploy_job(self):
        for filename in WORKFLOWS:
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

    def test_deploy_script_required_values_exclude_notification_settings(self):
        script = (ROOT / "infra/scripts/deploy.sh").read_text(encoding="utf-8")
        required = tuple(re.findall(r'^: "\$\{([A-Z_]+):\?', script, flags=re.MULTILINE))
        self.assertEqual(DEPLOY_SCRIPT_REQUIRED, required)
        for key in DEFAULTS:
            self.assertNotIn(key, script)


if __name__ == "__main__":
    unittest.main()
