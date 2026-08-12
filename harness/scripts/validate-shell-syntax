#!/usr/bin/env python3
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    paths = sorted(path for path in (ROOT / ".githooks").iterdir() if path.is_file())
    for path in paths:
        completed = subprocess.run(("sh", "-n", str(path)), cwd=ROOT, check=False)
        if completed.returncode != 0:
            return 1
    print(f"셸 문법 검증을 통과했습니다: {len(paths)}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
