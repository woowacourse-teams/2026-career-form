#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.shell_runtime import select_shell


def main() -> int:
    git_hooks = sorted(
        path for path in (ROOT / ".githooks").iterdir() if path.is_file()
    )
    infra_scripts = sorted((ROOT / "infra" / "scripts").glob("*.sh"))
    checks = ((str(select_shell()), git_hooks), ("bash", infra_scripts))
    for shell, paths in checks:
        for path in paths:
            completed = subprocess.run(
                (shell, "-n", str(path)), cwd=ROOT, check=False
            )
            if completed.returncode != 0:
                return 1
    print(
        "셸 문법 검증을 통과했습니다: "
        f"{len(git_hooks) + len(infra_scripts)}개"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
