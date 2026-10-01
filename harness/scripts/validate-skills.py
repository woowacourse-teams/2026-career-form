#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import print_result
from harness.lib.skill_inventory import validate_skill_inventory


if __name__ == "__main__":
    raise SystemExit(
        print_result(validate_skill_inventory(ROOT / ".agents" / "skills"))
    )
