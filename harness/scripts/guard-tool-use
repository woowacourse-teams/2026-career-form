#!/usr/bin/env python3
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.lib.cli import current_branch
from harness.lib.tool_guard import evaluate_tool_use


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
        branch = current_branch(payload.get("cwd"))
    except RuntimeError as error:
        deny(str(error))
        return 0
    decision = evaluate_tool_use(payload, branch)
    if not decision.blocked:
        return 0
    deny(decision.reason)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
