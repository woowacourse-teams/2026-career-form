#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.python_runtime import python_command, virtual_environment_python


def main() -> int:
    environment = ROOT / ".venv"
    dependencies = ROOT / "harness" / "requirements.txt"
    environment_python = virtual_environment_python(ROOT)
    setup = (
        (sys.executable, "-m", "venv", str(environment)),
        (str(environment_python), "-m", "pip", "install", "-r", str(dependencies)),
    )
    for command in setup:
        if subprocess.run(command, cwd=ROOT, check=False).returncode != 0:
            print("하네스 Python 환경을 구성하지 못했습니다", file=sys.stderr)
            return 1
    completed = subprocess.run(
        ("git", "config", "--local", "core.hooksPath", ".githooks"),
        cwd=ROOT,
        check=False,
    )
    if completed.returncode != 0:
        print("Git 훅 경로를 설정하지 못했습니다", file=sys.stderr)
        return 1
    doctor = ROOT / "harness" / "scripts" / "doctor.py"
    return subprocess.run(python_command(ROOT, doctor), cwd=ROOT, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
