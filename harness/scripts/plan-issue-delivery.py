#!/usr/bin/env python3
import argparse
import json
import sys
from collections.abc import Mapping
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import read_json
from harness.lib.issue_delivery import (
    DeliveryError,
    DeliveryObservation,
    next_delivery_action,
)
from harness.lib.workflow_checkpoint import (
    CheckpointError,
    WorkflowCheckpoint,
    git_is_clean,
    git_value,
    load_checkpoint,
    stage_checkpoint,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cwd", default=".")
    parser.add_argument("snapshot")
    arguments = parser.parse_args()
    try:
        checkpoint = load_checkpoint(arguments.cwd)
        if checkpoint is None:
            raise DeliveryError("현재 worktree에 체크포인트가 없습니다")
        observation = _observation(
            read_json(arguments.snapshot),
            checkpoint,
            Path(arguments.cwd),
        )
        action = next_delivery_action(checkpoint, observation)
    except (CheckpointError, DeliveryError, ValueError) as error:
        print(error, file=sys.stderr)
        return 2
    print(
        json.dumps(
            {"code": action.code, "reason": action.reason},
            ensure_ascii=False,
        )
    )
    return 0


def _observation(
    payload: Mapping[str, object],
    checkpoint: WorkflowCheckpoint,
    cwd: Path,
) -> DeliveryObservation:
    issue_number = payload.get("issue_number")
    if type(issue_number) is not int or issue_number < 1:
        raise DeliveryError("issue_number는 양의 정수여야 합니다")
    pull_request_number = payload.get("pull_request_number")
    if pull_request_number is not None and (
        type(pull_request_number) is not int or pull_request_number < 1
    ):
        raise DeliveryError("pull_request_number는 양의 정수여야 합니다")
    pull_request_head = payload.get("pull_request_head")
    if pull_request_head is not None and not isinstance(pull_request_head, str):
        raise DeliveryError("pull_request_head는 문자열이어야 합니다")
    if pull_request_number is not None and not pull_request_head:
        raise DeliveryError("Draft PR이 있으면 pull_request_head가 필요합니다")
    return DeliveryObservation(
        issue_number=issue_number,
        branch=git_value(cwd, "branch", "--show-current"),
        head=git_value(cwd, "rev-parse", "HEAD"),
        plan_exists=_plan_exists(checkpoint, cwd),
        worktree_clean=git_is_clean(cwd),
        pull_request_number=pull_request_number,
        pull_request_head=pull_request_head,
    )


def _plan_exists(checkpoint: WorkflowCheckpoint, cwd: Path) -> bool:
    try:
        plan = stage_checkpoint(checkpoint, "plan")
    except CheckpointError:
        return False
    path_value = dict(plan.evidence).get("plan_path")
    if not path_value:
        return False
    root = cwd.resolve()
    path = (root / path_value).resolve()
    return path.is_relative_to(root) and path.is_file()


if __name__ == "__main__":
    raise SystemExit(main())
