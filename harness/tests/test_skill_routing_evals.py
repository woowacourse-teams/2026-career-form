import json
import unittest
from pathlib import Path

from harness.lib.skill_routing_eval import validate_routing_evals


ROOT = Path(__file__).resolve().parents[2]


class SkillRoutingEvalTest(unittest.TestCase):
    def test_routing_eval_contract_is_valid(self) -> None:
        path = ROOT / "harness" / "evals" / "skill-routing.json"
        payload = json.loads(path.read_text(encoding="utf-8"))

        result = validate_routing_evals(payload, ROOT / ".agents" / "skills")

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_non_cf_expected_skill(self) -> None:
        payload = {
            "cases": [
                {
                    "id": "delivery-positive",
                    "prompt": "Issue 작업해줘",
                    "expected_skill": "issue-workflow",
                    "should_trigger": True,
                    "reason": "ready Issue 구현",
                },
                {
                    "id": "delivery-negative",
                    "prompt": "Issue를 요약해줘",
                    "expected_skill": "issue-workflow",
                    "should_trigger": False,
                    "reason": "읽기만 요청",
                },
            ]
        }

        result = validate_routing_evals(payload, ROOT / ".agents" / "skills")

        self.assertIn("expected_skill은 cf-로 시작해야 합니다", result.errors)

    def test_requires_positive_and_negative_pair_for_each_skill(self) -> None:
        payload = {
            "cases": [
                {
                    "id": "cleanup-positive",
                    "prompt": "머지했어. 정리해줘",
                    "expected_skill": "cf-post-merge-cleanup",
                    "should_trigger": True,
                    "reason": "머지 후 정리",
                }
            ]
        }

        result = validate_routing_evals(payload, ROOT / ".agents" / "skills")

        self.assertIn(
            "should-trigger와 should-not-trigger가 모두 필요합니다: cf-post-merge-cleanup",
            result.errors,
        )


if __name__ == "__main__":
    unittest.main()
