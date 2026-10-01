#!/usr/bin/env python3
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import read_json
from harness.lib.pr_labels import select_pr_labels


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: plan-pr-labels <Issue JSON>", file=sys.stderr)
        return 2
    try:
        payload = read_json(sys.argv[1])
        labels = select_pr_labels(payload)
    except ValueError as error:
        print(f"PR 라벨 입력을 읽을 수 없습니다: {error}", file=sys.stderr)
        return 2
    print(json.dumps({"labels": labels}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
