#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
VENV_PYTHON = ROOT / ".venv" / "bin" / "python"
PYTHON = str(VENV_PYTHON) if VENV_PYTHON.is_file() else sys.executable


def run(command: tuple[str, ...]) -> int:
    completed = subprocess.run(command, cwd=ROOT, check=False)
    return completed.returncode


def main() -> int:
    commands = (
        (PYTHON, "-m", "compileall", "-q", "harness"),
        (
            PYTHON,
            "-m",
            "coverage",
            "run",
            "--branch",
            "--source=harness/lib",
            "-m",
            "unittest",
            "discover",
            "-s",
            "harness/tests",
            "-v",
        ),
        (PYTHON, "-m", "coverage", "report", "--fail-under=80"),
        (PYTHON, str(ROOT / "harness" / "scripts" / "validate-shell-syntax.py")),
        (PYTHON, str(ROOT / "harness" / "scripts" / "validate-skills.py")),
        (PYTHON, str(ROOT / "harness" / "scripts" / "validate-execpolicy.py")),
        ("git", "diff", "--check"),
    )
    for command in commands:
        if run(command) != 0:
            return 1
    print("하네스 검증을 통과했습니다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
