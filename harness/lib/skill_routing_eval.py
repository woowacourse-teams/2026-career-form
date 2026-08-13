from collections import defaultdict
from collections.abc import Mapping
from pathlib import Path

from harness.lib.result import ValidationResult


def validate_routing_evals(
    payload: object,
    skills_root: Path,
) -> ValidationResult:
    if not isinstance(payload, Mapping) or not isinstance(payload.get("cases"), list):
        return ValidationResult(("라우팅 eval cases 목록이 필요합니다",))

    errors: list[str] = []
    coverage: dict[str, set[bool]] = defaultdict(set)
    identifiers: set[str] = set()
    for case in payload["cases"]:
        if not isinstance(case, Mapping):
            errors.append("라우팅 eval case는 객체여야 합니다")
            continue
        identifier = case.get("id")
        prompt = case.get("prompt")
        skill = case.get("expected_skill")
        should_trigger = case.get("should_trigger")
        reason = case.get("reason")
        if not isinstance(identifier, str) or not identifier.strip():
            errors.append("라우팅 eval id가 필요합니다")
        elif identifier in identifiers:
            errors.append(f"라우팅 eval id가 중복됩니다: {identifier}")
        else:
            identifiers.add(identifier)
        if not isinstance(prompt, str) or not prompt.strip():
            errors.append(f"라우팅 eval prompt가 필요합니다: {identifier}")
        if not isinstance(reason, str) or not reason.strip():
            errors.append(f"라우팅 eval 판단 근거가 필요합니다: {identifier}")
        if not isinstance(skill, str) or not skill.startswith("cf-"):
            errors.append("expected_skill은 cf-로 시작해야 합니다")
            continue
        if not (skills_root / skill / "SKILL.md").is_file():
            errors.append(f"expected_skill이 저장소에 없습니다: {skill}")
        if type(should_trigger) is not bool:
            errors.append(f"should_trigger는 boolean이어야 합니다: {identifier}")
            continue
        coverage[skill].add(should_trigger)

    for skill, outcomes in sorted(coverage.items()):
        if outcomes != {False, True}:
            errors.append(
                f"should-trigger와 should-not-trigger가 모두 필요합니다: {skill}"
            )
    return ValidationResult(tuple(errors))
