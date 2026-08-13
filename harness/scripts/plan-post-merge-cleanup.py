#!/usr/bin/env python3
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import read_json
from harness.lib.post_merge_cleanup import cleanup_snapshot_from, plan_cleanup


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: plan-post-merge-cleanup <snapshot 파일>", file=sys.stderr)
        return 2
    try:
        plan = plan_cleanup(cleanup_snapshot_from(read_json(sys.argv[1])))
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    print(
        json.dumps(
            {
                "status": plan.status,
                "reason": plan.reason,
                "remove_worktrees": plan.remove_worktrees,
                "preserve_worktrees": plan.preserve_worktrees,
                "delete_local_branch": plan.delete_local_branch,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
