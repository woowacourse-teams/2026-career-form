#!/usr/bin/env python3
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import read_json
from harness.lib.issue_lifecycle import lifecycle_snapshot_from, next_lifecycle_action


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: plan-issue-lifecycle <snapshot 파일>", file=sys.stderr)
        return 2
    try:
        action = next_lifecycle_action(
            lifecycle_snapshot_from(read_json(sys.argv[1]))
        )
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    print(
        json.dumps(
            {"code": action.code, "skill": action.skill, "reason": action.reason},
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
