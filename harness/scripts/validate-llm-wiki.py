#!/usr/bin/env python3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.llm_wiki import validate_wiki
from harness.lib.result import ValidationResult


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else ROOT
    result = validate_wiki(root)
    if result.is_valid:
        print("LLM Wiki 구조 검증을 통과했습니다")
        return 0
    for error in result.errors:
        print(error, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
