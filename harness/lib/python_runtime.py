import os
import sys
from pathlib import Path


def virtual_environment_python(root: Path, *, os_name: str = os.name) -> Path:
    relative = (
        Path("Scripts") / "python.exe"
        if os_name == "nt"
        else Path("bin") / "python"
    )
    return root / ".venv" / relative


def select_python(
    root: Path,
    *,
    fallback: str | Path = sys.executable,
    os_name: str = os.name,
) -> Path:
    candidate = virtual_environment_python(root, os_name=os_name)
    return candidate if candidate.is_file() else Path(fallback)


def python_command(
    root: Path,
    script: Path,
    *arguments: str,
    fallback: str | Path = sys.executable,
    os_name: str = os.name,
) -> tuple[str, ...]:
    python = select_python(root, fallback=fallback, os_name=os_name)
    return (str(python), str(script), *arguments)
