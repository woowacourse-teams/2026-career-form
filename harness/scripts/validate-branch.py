#!/usr/bin/env python3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.lib.branching import validate_branch_flow
from harness.lib.cli import print_result


def main() -> int:
    if len(sys.argv) != 3:
        print("사용법: validate-branch <head> <base>", file=sys.stderr)
        return 2
    return print_result(validate_branch_flow(sys.argv[1], sys.argv[2]))


if __name__ == "__main__":
    raise SystemExit(main())
