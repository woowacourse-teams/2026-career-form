#!/usr/bin/env python3
import argparse
import subprocess
import sys
from pathlib import Path
from typing import List, Optional, Sequence


ROOT = Path(__file__).resolve().parents[1]
ACTION_ARGUMENTS = {
    "up": ("up", "--build", "--detach", "--wait"),
    "down": ("down",),
    "logs": ("logs", "--follow", "--tail", "200", "backend", "mongodb"),
    "status": ("ps",),
}


def parse_action(arguments: Optional[Sequence[str]] = None) -> str:
    parser = argparse.ArgumentParser(
        description="로컬 Spring과 MongoDB Compose 환경을 관리합니다.",
    )
    parser.add_argument(
        "action",
        nargs="?",
        default="up",
        choices=tuple(ACTION_ARGUMENTS),
        help="기본값은 up입니다.",
    )
    return str(parser.parse_args(arguments).action)


def compose_prefix(root: Path) -> List[str]:
    return [
        "docker",
        "compose",
        "--env-file",
        str(root / ".env.local"),
        "--project-directory",
        str(root),
        "-f",
        str(root / "compose.yaml"),
        "-f",
        str(root / "compose.local.yaml"),
    ]


def run_compose(command: Sequence[str], root: Path) -> int:
    try:
        return subprocess.run(command, cwd=root, check=False).returncode
    except FileNotFoundError:
        print(
            "Docker CLI를 찾을 수 없습니다. Docker Desktop의 설치와 실행 상태를 확인해 주세요.",
            file=sys.stderr,
        )
        return 127


def run_action(action: str, root: Path = ROOT) -> int:
    env_file = root / ".env.local"
    if not env_file.is_file():
        print(
            f"필수 환경 파일이 없습니다: {env_file}",
            file=sys.stderr,
        )
        return 2

    prefix = compose_prefix(root)
    if action == "up":
        validation = run_compose([*prefix, "config", "--quiet"], root)
        if validation != 0:
            return validation
    return run_compose([*prefix, *ACTION_ARGUMENTS[action]], root)


def main(arguments: Optional[Sequence[str]] = None) -> int:
    return run_action(parse_action(arguments))


if __name__ == "__main__":
    raise SystemExit(main())
