import json
import re
from collections.abc import Mapping
from pathlib import Path

import yaml

from harness.lib.result import ValidationResult


PROJECT_SKILLS = (
    "github-project-onboarding",
    "issue-workflow",
    "project-issue-planning",
)
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
REQUIRED_METADATA = ("repository", "path", "commit", "retrieved_at", "license")


def validate_skill_inventory(root: Path) -> ValidationResult:
    errors: list[str] = []
    if not root.is_dir():
        return ValidationResult((f"스킬 폴더가 없습니다: {root}",))
    for skill in sorted(path for path in root.iterdir() if path.is_dir()):
        errors.extend(_validate_skill(skill))
    return ValidationResult(tuple(errors))


def _validate_skill(skill: Path) -> tuple[str, ...]:
    errors: list[str] = []
    if skill.is_symlink():
        errors.append(f"스킬은 심볼릭 링크일 수 없습니다: {skill.name}")
    skill_file = skill / "SKILL.md"
    if not skill_file.is_file():
        errors.append(f"SKILL.md가 없습니다: {skill.name}")
    else:
        errors.extend(_validate_skill_file(skill.name, skill_file))
    if skill.name in PROJECT_SKILLS:
        return tuple(errors)

    metadata = skill / "UPSTREAM.json"
    license_file = skill / "LICENSE"
    if not metadata.is_file():
        errors.append(f"외부 스킬 메타데이터가 없습니다: {skill.name}/UPSTREAM.json")
    else:
        errors.extend(_validate_metadata(skill.name, metadata))
    if not license_file.is_file():
        errors.append(f"외부 스킬 라이선스가 없습니다: {skill.name}/LICENSE")
    return tuple(errors)


def _validate_skill_file(name: str, path: Path) -> tuple[str, ...]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
        if not lines or lines[0] != "---":
            raise ValueError
        closing = lines.index("---", 1)
        value = yaml.safe_load("\n".join(lines[1:closing]))
    except (OSError, ValueError, yaml.YAMLError):
        return (f"스킬 frontmatter가 올바르지 않습니다: {name}",)

    if not isinstance(value, Mapping):
        return (f"스킬 frontmatter가 올바르지 않습니다: {name}",)

    errors: list[str] = []
    if value.get("name") != name:
        errors.append(f"스킬 name이 폴더 이름과 다릅니다: {name}")
    if not isinstance(value.get("description"), str) or not value["description"].strip():
        errors.append(f"스킬 description이 없습니다: {name}")
    return tuple(errors)


def _validate_metadata(name: str, path: Path) -> tuple[str, ...]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return (f"외부 스킬 메타데이터를 읽을 수 없습니다: {name}: {error}",)
    missing = tuple(key for key in REQUIRED_METADATA if not value.get(key))
    errors = [f"외부 스킬 메타데이터 필드가 없습니다: {name}: {key}" for key in missing]
    if not SHA_PATTERN.match(str(value.get("commit", ""))):
        errors.append(f"외부 스킬 commit은 40자 SHA여야 합니다: {name}")
    return tuple(errors)
