#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.workflow_checkpoint import (
    CheckpointError,
    begin_stage,
    checkpoint_payload,
    complete_stage,
    git_value,
    initialize_checkpoint,
    load_checkpoint,
    resume_stage,
    save_checkpoint,
)


def main() -> int:
    parser = _parser()
    arguments = parser.parse_args()
    try:
        checkpoint = _execute(arguments)
    except CheckpointError as error:
        print(error, file=sys.stderr)
        return 2
    print(json.dumps(checkpoint_payload(checkpoint), ensure_ascii=False))
    return 0


def _execute(arguments: argparse.Namespace):
    if arguments.action == "init":
        return initialize_checkpoint(
            arguments.cwd,
            issue_number=arguments.issue_number,
            branch=git_value(arguments.cwd, "branch", "--show-current"),
            head=git_value(arguments.cwd, "rev-parse", "HEAD"),
        )
    checkpoint = load_checkpoint(arguments.cwd)
    if checkpoint is None:
        raise CheckpointError("현재 worktree에 체크포인트가 없습니다")
    if arguments.action == "show":
        return checkpoint
    head = git_value(arguments.cwd, "rev-parse", "HEAD")
    if arguments.action == "begin":
        updated = begin_stage(checkpoint, stage=arguments.stage, head=head)
    elif arguments.action == "resume":
        updated = resume_stage(checkpoint, stage=arguments.stage, head=head)
    else:
        updated = complete_stage(
            checkpoint,
            stage=arguments.stage,
            head=head,
            evidence=_evidence(arguments.evidence),
        )
    save_checkpoint(arguments.cwd, updated)
    return updated


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cwd", default=".")
    actions = parser.add_subparsers(dest="action", required=True)
    initialize = actions.add_parser("init")
    initialize.add_argument("issue_number", type=int)
    actions.add_parser("show")
    begin = actions.add_parser("begin")
    begin.add_argument("stage")
    resume = actions.add_parser("resume")
    resume.add_argument("stage")
    complete = actions.add_parser("complete")
    complete.add_argument("stage")
    complete.add_argument("--evidence", action="append", default=[])
    return parser


def _evidence(values: list[str]) -> dict[str, str]:
    evidence: dict[str, str] = {}
    for value in values:
        key, separator, item = value.partition("=")
        if not separator or not key or not item:
            raise CheckpointError("완료 근거는 key=value 형식이어야 합니다")
        if key in evidence:
            raise CheckpointError(f"완료 근거가 중복됐습니다: {key}")
        evidence = {**evidence, key: item}
    return evidence


if __name__ == "__main__":
    raise SystemExit(main())
