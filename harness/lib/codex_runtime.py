import shutil
from collections.abc import Callable
from pathlib import Path


def select_codex(
    *, command_lookup: Callable[[str], str | None] = shutil.which
) -> Path:
    executable = command_lookup("codex")
    if executable is None:
        raise FileNotFoundError("codex 실행 파일을 찾을 수 없습니다")
    path = Path(executable)
    if _is_wsl_windows_mount(path):
        raise FileNotFoundError("WSL 내부에 설치한 codex 실행 파일이 필요합니다")
    return path


def _is_wsl_windows_mount(path: Path) -> bool:
    return (
        len(path.parts) >= 3
        and path.parts[0:2] == ("/", "mnt")
        and len(path.parts[2]) == 1
        and path.parts[2].isalpha()
    )
