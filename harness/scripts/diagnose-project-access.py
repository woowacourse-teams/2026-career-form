#!/usr/bin/env python3
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.project_access import diagnose_project_access
from harness.lib.project_config import ProjectConfigError, load_project_config


def run(command: tuple[str, ...]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        check=False,
        text=True,
    )


def main() -> int:
    if shutil.which("gh") is None:
        diagnosis = diagnose_project_access(False, None, None, "")
        return print_diagnosis(diagnosis.code, diagnosis.message, diagnosis.resolutions)

    auth = run(("gh", "auth", "status", "--hostname", "github.com"))
    if auth.returncode != 0:
        diagnosis = diagnose_project_access(True, auth.returncode, None, "")
        return print_diagnosis(diagnosis.code, diagnosis.message, diagnosis.resolutions)

    try:
        config = load_project_config(ROOT / "harness" / "project.json")
    except ProjectConfigError as error:
        print(f"config_error: {error}")
        return 1

    project = run(
        (
            "gh",
            "project",
            "view",
            str(config.number),
            "--owner",
            config.owner,
            "--format",
            "json",
        )
    )
    diagnosis = diagnose_project_access(
        True,
        auth.returncode,
        project.returncode,
        project.stderr,
    )
    return print_diagnosis(diagnosis.code, diagnosis.message, diagnosis.resolutions)


def print_diagnosis(code: str, message: str, resolutions: tuple[str, ...]) -> int:
    print(f"{code}: {message}")
    for resolution in resolutions:
        print(f"해결: {resolution}")
    return 0 if code == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
