#!/usr/bin/env python3
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import print_result
from harness.lib.skill_routing_eval import validate_routing_evals


def main() -> int:
    path = ROOT / "harness" / "evals" / "skill-routing.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"라우팅 eval을 읽을 수 없습니다: {error}", file=sys.stderr)
        return 2
    return print_result(
        validate_routing_evals(payload, ROOT / ".agents" / "skills")
    )


if __name__ == "__main__":
    raise SystemExit(main())
