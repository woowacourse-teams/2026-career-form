import json
import os
import subprocess
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
DEFAULTS = {
    "CAREER_FORM_ADMISSION_ENABLED": "false",
    "CAREER_FORM_ADMISSION_REGISTRATION_ENABLED": "false",
    "CAREER_FORM_ADMISSION_TRUSTED_PROXIES": "",
    "CAREER_FORM_ADMISSION_ENCRYPTION_KEY": "",
}
SYNTHETIC = {
    "CAREER_FORM_ADMISSION_ENABLED": "true",
    "CAREER_FORM_ADMISSION_REGISTRATION_ENABLED": "true",
    "CAREER_FORM_ADMISSION_TRUSTED_PROXIES": "127.0.0.1,172.19.0.1",
    "CAREER_FORM_ADMISSION_ENCRYPTION_KEY": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
}


class AdmissionDeploymentTest(unittest.TestCase):
    def render(self, profile, settings):
        environment = {name: value for name, value in os.environ.items()
            if not name.startswith("CAREER_FORM_ADMISSION_")}
        environment.update({
            "BACKEND_IMAGE": "registry.example/career-form@sha256:" + "a" * 64,
            "BACKEND_PORT": "18081", "SPRING_PROFILES_ACTIVE": profile,
            "SPRING_MONGODB_URI": "mongodb://synthetic.invalid/admission",
            "OPENAI_API_KEY": "synthetic", **settings,
        })
        result = subprocess.run(("docker", "compose", "--project-name", "admission-deployment-test",
            "--env-file", "/dev/null", "-f", str(ROOT / "compose.yaml"),
            "-f", str(ROOT / "infra/compose.deploy.yaml"), "config", "--format", "json"),
            cwd=ROOT, env=environment, text=True, capture_output=True, check=False)
        self.assertEqual(0, result.returncode, result.stderr)
        return json.loads(result.stdout)["services"]["backend"]["environment"]

    def test_missing_and_empty_settings_keep_protection_disabled(self):
        for profile in ("dev", "staging", "prod"):
            for settings in ({}, dict.fromkeys(DEFAULTS, "")):
                with self.subTest(profile=profile, settings=settings):
                    runtime = self.render(profile, settings)
                    for name, value in DEFAULTS.items():
                        self.assertEqual(value, runtime.get(name), name)

    def test_staging_and_production_receive_explicit_settings(self):
        for profile in ("staging", "prod"):
            with self.subTest(profile=profile):
                runtime = self.render(profile, SYNTHETIC)
                for name, value in SYNTHETIC.items():
                    self.assertEqual(value, runtime.get(name), name)

    def test_registration_only_rollout_does_not_enforce_analysis(self):
        runtime = self.render("prod", {**SYNTHETIC, "CAREER_FORM_ADMISSION_ENABLED": "false"})
        self.assertEqual("false", runtime.get("CAREER_FORM_ADMISSION_ENABLED"))
        self.assertEqual("true", runtime.get("CAREER_FORM_ADMISSION_REGISTRATION_ENABLED"))

    def test_workflows_inject_settings_and_keep_encryption_key_out_of_builds(self):
        for filename in ("deploy-development.yml", "deploy-staging.yml", "deploy-production.yml"):
            with self.subTest(workflow=filename):
                workflow = yaml.load((ROOT / ".github/workflows" / filename).read_text(), Loader=yaml.BaseLoader)
                for name in DEFAULTS:
                    source = "secrets" if name.endswith("ENCRYPTION_KEY") else "vars"
                    self.assertEqual("${{ " + source + "." + name + " }}",
                        workflow["jobs"]["deploy"]["env"].get(name), name)
                for job, definition in workflow["jobs"].items():
                    if job != "deploy":
                        self.assertNotIn("CAREER_FORM_ADMISSION_ENCRYPTION_KEY", str(definition))


if __name__ == "__main__":
    unittest.main()
