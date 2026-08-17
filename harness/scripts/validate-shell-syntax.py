#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.shell_runtime import select_shell


def main() -> int:
    git_hooks = (path for path in (ROOT / ".githooks").iterdir() if path.is_file())
    infra_scripts = (ROOT / "infra" / "scripts").glob("*.sh")
    paths = sorted((*git_hooks, *infra_scripts))
    for path in paths:
        completed = subprocess.run(
            (str(select_shell()), "-n", str(path)), cwd=ROOT, check=False
        )
        if completed.returncode != 0:
            return 1
    print(f"셸 문법 검증을 통과했습니다: {len(paths)}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
