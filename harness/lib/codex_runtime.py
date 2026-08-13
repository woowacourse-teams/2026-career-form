import shutil
from collections.abc import Callable
from pathlib import Path


def select_codex(
    *, command_lookup: Callable[[str], str | None] = shutil.which
) -> Path:
    executable = command_lookup("codex")
    if executable is None:
        raise FileNotFoundError("codex 실행 파일을 찾을 수 없습니다")
    return Path(executable)
