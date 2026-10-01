from pathlib import Path


def select_shell(
    *,
    os_name: str = "posix",
    program_files: Path | None = None,
) -> Path | str:
    _ = (os_name, program_files)
    return "sh"
