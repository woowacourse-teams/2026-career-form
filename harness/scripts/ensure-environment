#!/usr/bin/env python3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.environment_setup import ensure_environment


def main() -> int:
    result = ensure_environment(ROOT)
    stream = sys.stdout if result.is_ready else sys.stderr
    print(result.message, file=stream)
    return 0 if result.is_ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
