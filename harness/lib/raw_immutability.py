import os
import subprocess
from pathlib import Path


LOCAL_GIT_ENVIRONMENT = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_PREFIX",
)


def validate_raw_immutability(root: Path, base_ref: str) -> list[str]:
    listed = _git_text(
        root,
        "ls-tree",
        "-r",
        "--name-only",
        base_ref,
        "--",
        "llm-wiki/raw",
    )
    if listed.returncode != 0:
        return [f"raw 기준 ref를 확인할 수 없습니다: {base_ref}"]
    errors: list[str] = []
    for relative in listed.stdout.splitlines():
        baseline = _git_bytes(root, "show", f"{base_ref}:{relative}")
        current = root / relative
        if baseline.returncode != 0:
            errors.append(f"기준 raw를 읽을 수 없습니다: {relative}")
        elif not current.is_file() or current.read_bytes() != baseline.stdout:
            errors.append(f"기준 브랜치에 존재하는 raw를 변경할 수 없습니다: {relative}")
    return errors


def _git_text(root: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    for name in LOCAL_GIT_ENVIRONMENT:
        environment.pop(name, None)
    return subprocess.run(
        ("git", *arguments),
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


def _git_bytes(root: Path, *arguments: str) -> subprocess.CompletedProcess[bytes]:
    environment = os.environ.copy()
    for name in LOCAL_GIT_ENVIRONMENT:
        environment.pop(name, None)
    return subprocess.run(
        ("git", *arguments),
        cwd=root,
        env=environment,
        capture_output=True,
        check=False,
    )
