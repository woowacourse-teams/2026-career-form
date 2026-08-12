import json
from dataclasses import dataclass
from pathlib import Path


class ProjectConfigError(ValueError):
    pass


@dataclass(frozen=True)
class ProjectConfig:
    owner: str
    number: int
    repository: str


def load_project_config(path: Path) -> ProjectConfig:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ProjectConfigError(f"Project 설정을 읽을 수 없습니다: {error}") from error

    if not isinstance(value, dict):
        raise ProjectConfigError("Project 설정은 JSON 객체여야 합니다")

    owner = value.get("owner")
    number = value.get("number")
    repository = value.get("repository")
    if not isinstance(owner, str) or not owner.strip():
        raise ProjectConfigError("Project 설정에 owner가 필요합니다")
    if isinstance(number, bool) or not isinstance(number, int) or number < 1:
        raise ProjectConfigError("Project 설정에 양의 정수 number가 필요합니다")
    if not isinstance(repository, str) or not repository.strip():
        raise ProjectConfigError("Project 설정에 repository가 필요합니다")

    return ProjectConfig(
        owner=owner.strip(),
        number=number,
        repository=repository.strip(),
    )
