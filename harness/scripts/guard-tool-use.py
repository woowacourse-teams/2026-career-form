#!/usr/bin/env python3
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.lib.tool_guard import evaluate_tool_use, needs_workflow_checkpoint
from harness.lib.workflow_checkpoint import (
    CheckpointError,
    git_is_clean,
    git_value,
    load_checkpoint,
)


def deny(reason: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            },
            ensure_ascii=False,
        )
    )


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        print(f"Codex 훅 입력을 읽을 수 없습니다: {error}", file=sys.stderr)
        return 2
    if not isinstance(payload, dict):
        print("Codex 훅 입력은 객체여야 합니다", file=sys.stderr)
        return 2

    try:
        cwd = payload.get("cwd")
        directory = cwd if isinstance(cwd, str) else "."
        branch = git_value(directory, "branch", "--show-current")
    except CheckpointError:
        deny("현재 브랜치를 확인할 수 없습니다")
        return 0
    checkpoint = None
    current_head = None
    worktree_clean = None
    if needs_workflow_checkpoint(payload, branch):
        try:
            checkpoint = load_checkpoint(directory)
            current_head = git_value(directory, "rev-parse", "HEAD")
            worktree_clean = git_is_clean(directory)
        except CheckpointError as error:
            deny(str(error))
            return 0
    decision = evaluate_tool_use(
        payload,
        branch,
        checkpoint=checkpoint,
        current_head=current_head,
        worktree_clean=worktree_clean,
    )
    if not decision.blocked:
        return 0
    deny(decision.reason)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
