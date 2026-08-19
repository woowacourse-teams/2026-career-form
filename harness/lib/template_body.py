import re
from collections.abc import Mapping
from pathlib import Path

import yaml


HEADING_PATTERN = re.compile(r"(?m)^## (?P<name>[^\n]+)\s*$")
CLOSE_PATTERN = re.compile(r"(?m)^Closes #(?:[1-9][0-9]*)?\s*$")
ANSWER_PATTERN = re.compile(
    r"<!--\s*cf-answer:\s*(?P<name>[^\n]+?)\s*-->",
)


def render_issue_form(path: Path, answers: Mapping[str, str]) -> str:
    try:
        form = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        raise ValueError(f"Issue Form을 읽을 수 없습니다: {error}") from error
    if not isinstance(form, Mapping):
        raise ValueError("Issue Form은 YAML 객체여야 합니다")
    items = form.get("body")
    if not isinstance(items, list):
        raise ValueError("Issue Form body는 목록이어야 합니다")

    known_ids = {
        identifier
        for item in items
        if isinstance(item, Mapping)
        and isinstance((identifier := item.get("id")), str)
    }
    unknown = tuple(sorted(set(answers) - known_ids))
    if unknown:
        raise ValueError(f"알 수 없는 Issue Form 입력: {', '.join(unknown)}")

    blocks: list[str] = []
    for item in items:
        if not isinstance(item, Mapping):
            continue
        attributes = item.get("attributes")
        if not isinstance(attributes, Mapping):
            continue
        if item.get("type") == "markdown":
            value = attributes.get("value")
            if isinstance(value, str) and value.strip():
                blocks.append(value.strip())
            continue
        identifier = item.get("id")
        label = attributes.get("label")
        if not isinstance(identifier, str) or not isinstance(label, str):
            continue
        default = attributes.get("value")
        value = answers.get(identifier, default if isinstance(default, str) else "")
        blocks.append(f"## {label.strip()}\n\n{value.strip()}")
    return "\n\n".join(blocks).rstrip() + "\n"


def render_pr_template(
    template: str,
    answers: Mapping[str, str],
    *,
    issue_number: int,
) -> str:
    if issue_number < 1:
        raise ValueError("Issue 번호는 양의 정수여야 합니다")
    close = CLOSE_PATTERN.search(template)
    if close is None:
        raise ValueError("PR 템플릿에 Closes # 줄이 필요합니다")
    answer_markers = tuple(ANSWER_PATTERN.finditer(template))
    if answer_markers:
        names = tuple(
            marker.group("name").strip()
            for marker in answer_markers
        )
        _validate_pr_answers(names, answers)
        rendered = ANSWER_PATTERN.sub(
            lambda marker: answers[marker.group("name").strip()].strip(),
            template,
        )
        return CLOSE_PATTERN.sub(
            f"Closes #{issue_number}",
            rendered,
            count=1,
        ).rstrip() + "\n"
    content = template[: close.start()].rstrip()
    suffix = template[close.start() :]
    headings = tuple(HEADING_PATTERN.finditer(content))
    if not headings:
        raise ValueError("PR 템플릿에 ## 섹션이 필요합니다")

    names = tuple(match.group("name").strip() for match in headings)
    _validate_pr_answers(names, answers)

    preamble = content[: headings[0].start()].rstrip()
    blocks = [preamble] if preamble else []
    blocks.extend(f"## {name}\n\n{answers[name].strip()}" for name in names)
    closing = CLOSE_PATTERN.sub(f"Closes #{issue_number}", suffix, count=1).strip()
    blocks.append(closing)
    return "\n\n".join(blocks).rstrip() + "\n"


def _validate_pr_answers(
    names: tuple[str, ...],
    answers: Mapping[str, str],
) -> None:
    duplicates = tuple(sorted({name for name in names if names.count(name) > 1}))
    if duplicates:
        raise ValueError(f"PR 템플릿 응답 표식이 중복됩니다: {', '.join(duplicates)}")
    missing = tuple(name for name in names if not answers.get(name, "").strip())
    unknown = tuple(sorted(set(answers) - set(names)))
    if missing or unknown:
        details: list[str] = []
        if missing:
            details.append(f"누락: {', '.join(missing)}")
        if unknown:
            details.append(f"알 수 없음: {', '.join(unknown)}")
        raise ValueError(f"PR 템플릿 섹션 응답이 올바르지 않습니다: {'; '.join(details)}")
