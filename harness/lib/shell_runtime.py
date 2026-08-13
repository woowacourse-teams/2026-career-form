import os
from pathlib import Path


def select_shell(
    *,
    os_name: str = os.name,
    program_files: Path | None = None,
) -> Path | str:
    if os_name != "nt":
        return "sh"

    root = program_files or Path(os.environ["ProgramFiles"])
    candidate = root / "Git" / "bin" / "sh.exe"
    return candidate if candidate.is_file() else "sh"
