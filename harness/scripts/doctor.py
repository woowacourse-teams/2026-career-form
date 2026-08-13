#!/usr/bin/env python3
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REQUIRED_COMMANDS = ("codex", "gh", "git", "python3")
REQUIRED_PATHS = (
    ".codex/config.toml",
    ".codex/hooks.json",
    ".githooks/commit-msg",
    ".githooks/pre-commit",
    ".githooks/pre-push",
    ".agents/skills/issue-workflow/SKILL.md",
    ".venv/bin/python",
)


def git_hooks_path() -> str:
    completed = subprocess.run(
        ("git", "config", "--local", "--get", "core.hooksPath"),
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return completed.stdout.strip()


def main() -> int:
    errors = [
        f"명령을 찾을 수 없습니다: {command}"
        for command in REQUIRED_COMMANDS
        if shutil.which(command) is None
    ]
    errors.extend(
        f"필수 파일이 없습니다: {path}"
        for path in REQUIRED_PATHS
        if not (ROOT / path).is_file()
    )
    if git_hooks_path() != ".githooks":
        errors.append("core.hooksPath가 .githooks로 설정되지 않았습니다")
    if errors:
        for error in errors:
            print(f"오류: {error}")
        return 1
    print("하네스 설치 상태가 정상입니다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
