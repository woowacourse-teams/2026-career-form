#!/usr/bin/env python3
import sys
from collections.abc import Mapping
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import read_json
from harness.lib.project_issue import ProjectIssueSnapshot, next_planning_action


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: plan-project-issue <snapshot 파일>", file=sys.stderr)
        return 2
    try:
        payload = read_json(sys.argv[1])
        snapshot = snapshot_from(payload)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2

    action = next_planning_action(snapshot)
    print(f"{action.code}: {action.reason}")
    return 0


def snapshot_from(payload: Mapping[str, object]) -> ProjectIssueSnapshot:
    draft_matches = payload.get("draft_matches")
    issue_number = payload.get("issue_number")
    issue_status_label = payload.get("issue_status_label")
    project_status = payload.get("project_status")
    approved_contract_digest = optional_string(
        payload, "approved_contract_digest"
    )
    latest_contract_digest = optional_string(payload, "latest_contract_digest")
    if isinstance(draft_matches, bool) or not isinstance(draft_matches, int):
        raise ValueError("draft_matches는 정수여야 합니다")
    if draft_matches < 0:
        raise ValueError("draft_matches는 음수일 수 없습니다")
    if issue_number is not None and (
        isinstance(issue_number, bool)
        or not isinstance(issue_number, int)
        or issue_number < 1
    ):
        raise ValueError("issue_number는 양의 정수여야 합니다")
    if project_status is not None and not isinstance(project_status, str):
        raise ValueError("project_status는 문자열이어야 합니다")
    if issue_status_label is not None and not isinstance(issue_status_label, str):
        raise ValueError("issue_status_label은 문자열이어야 합니다")

    return ProjectIssueSnapshot(
        draft_matches=draft_matches,
        issue_number=issue_number,
        title_valid=optional_boolean(payload, "title_valid", default=True),
        issue_status_label=issue_status_label,
        project_status=project_status,
        contract_drafted=optional_boolean(payload, "contract_drafted"),
        plan_exists=optional_boolean(payload, "plan_exists"),
        approved=optional_boolean(payload, "approved"),
        contract_published=optional_boolean(payload, "contract_published"),
        contract_valid=optional_boolean(payload, "contract_valid"),
        approved_contract_digest=approved_contract_digest,
        latest_contract_digest=latest_contract_digest,
    )


def optional_boolean(
    payload: Mapping[str, object], name: str, *, default: bool = False
) -> bool:
    if name not in payload:
        return default
    value = payload[name]
    if type(value) is not bool:
        raise ValueError(f"{name}는 boolean이어야 합니다")
    return value


def optional_string(
    payload: Mapping[str, object], name: str
) -> str | None:
    value = payload.get(name)
    if value is not None and not isinstance(value, str):
        raise ValueError(f"{name}은 문자열이어야 합니다")
    return value


if __name__ == "__main__":
    raise SystemExit(main())
