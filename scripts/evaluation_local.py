#!/usr/bin/env python3
"""AI 평가 화면을 이 체크아웃의 코드로 로컬에서 띄운다.

프롬프트·호출 구조·설정을 고칠 때마다 다시 띄워 평가를 돌리고, 화면에서 기준 실행과 비교한다.
코드 버전은 커밋 번호이고, 커밋하지 않은 backend 변경이 있으면 변경 지문을 붙여 실행 조건에서 구분한다.
비밀번호 원문은 저장하지 않고 해시만 Git 메타데이터 폴더(저장소 밖)에 둔다. 평가 기록은 로컬 MongoDB 볼륨에만 남는다.

사용: python3 scripts/evaluation_local.py [up|stop|reset-password]
"""
import argparse
import base64
import getpass
import hashlib
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Dict, Mapping, Optional, Sequence

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = "compose.evaluation-local.yaml"
ITERATIONS = 600_000
DEFAULTS = {
    "CF_EVAL_PROJECT": "career-form-eval",
    "CF_EVAL_PORT": "18090",
    "CF_EVAL_DATA_VOLUME": "career-form-evaluation-data",
    "CF_EVAL_MAX_MODEL_CALLS": "200",
}


def git(root: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()


def code_version(root: Path) -> str:
    """커밋 번호. 커밋하지 않은 backend 변경(새 파일 포함)이 있으면 그 내용의 지문을 붙인다."""
    head = git(root, "rev-parse", "--short", "HEAD")
    if not git(root, "status", "--porcelain", "--", "backend"):
        return head
    digest = hashlib.sha256(subprocess.run(["git", "diff", "HEAD", "--binary", "--", "backend"], cwd=root,
                                           check=True, capture_output=True).stdout)
    for path in sorted(git(root, "ls-files", "--others", "--exclude-standard", "--", "backend").splitlines()):
        digest.update(path.encode("utf-8"))
        digest.update((root / path).read_bytes())
    return f"{head}-dirty-{digest.hexdigest()[:7]}"


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    """백엔드 품질 비밀번호 검증 형식(pbkdf2-sha256$반복수$salt$digest)."""
    if not password:
        raise ValueError("비밀번호가 비어 있습니다")
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS, 32)
    return "pbkdf2-sha256$%d$%s$%s" % (ITERATIONS, base64.b64encode(salt).decode(), base64.b64encode(digest).decode())


def password_file(root: Path) -> Path:
    path = Path(git(root, "rev-parse", "--git-path", "cf-workflow/evaluation-password.hash"))
    return path if path.is_absolute() else root / path


def env_file(root: Path) -> Optional[Path]:
    """이 체크아웃, 없으면 메인 체크아웃(worktree의 공통 저장소)의 .env.local."""
    common = Path(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir")).parent
    return next((path for path in (root / ".env.local", common / ".env.local") if path.is_file()), None)


def compose_environment(env: Path, password_hash: str, version: str, base: Mapping[str, str]) -> Dict[str, str]:
    environment = {**DEFAULTS, **dict(base)}
    environment.update(CF_EVAL_ENV_FILE=str(env), CF_EVAL_PASSWORD_HASH=password_hash, CF_EVAL_CODE_VERSION=version)
    return environment


def ensure_password(root: Path, reset: bool) -> str:
    path = password_file(root)
    if reset or not path.is_file() or not path.read_text(encoding="utf-8").strip():
        print("평가 화면 로그인에 쓸 비밀번호를 새로 정해 입력하세요(아무 값이나 가능, 화면에 안 보임).")
        value = hash_password(getpass.getpass("평가 화면에서 쓸 비밀번호: "))
        path.parent.mkdir(parents=True, exist_ok=True)
        old = os.umask(0o077)
        try:
            path.write_text(value + "\n", encoding="utf-8")
        finally:
            os.umask(old)
    return path.read_text(encoding="utf-8").strip()


def compose(root: Path, environment: Mapping[str, str], *args: str) -> int:
    command = ["docker", "compose", "--project-name", environment["CF_EVAL_PROJECT"], "-f", str(root / COMPOSE), *args]
    return subprocess.run(command, cwd=root, env={**os.environ, **environment}, check=False).returncode


def wait_ready(port: str, attempts: int = 60) -> bool:
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/actuator/health", timeout=3) as response:
                if response.status == 200:
                    return True
        except OSError:
            pass
        time.sleep(3)
    return False


def main(arguments: Optional[Sequence[str]] = None, root: Path = ROOT) -> int:
    parser = argparse.ArgumentParser(description="AI 평가 화면을 이 체크아웃의 코드로 로컬에서 띄웁니다.")
    parser.add_argument("action", nargs="?", default="up", choices=("up", "stop", "reset-password"))
    action = parser.parse_args(arguments).action
    env = env_file(root)
    if env is None:
        print("필수 환경 파일 .env.local이 없습니다(이 체크아웃 또는 메인 체크아웃).", file=sys.stderr)
        return 2
    if action == "stop":
        return compose(root, compose_environment(env, "unused", "unused", os.environ), "down")
    password_hash = ensure_password(root, reset=action == "reset-password")
    version = code_version(root)
    environment = compose_environment(env, password_hash, version, os.environ)
    print(f"코드 버전 {version} 으로 백엔드를 빌드합니다(1~2분)...")
    build = subprocess.run(["./gradlew", "bootJar", "-q"], cwd=root / "backend", check=False).returncode
    if build != 0:
        print("백엔드 빌드에 실패했습니다. 위 출력을 확인하세요.", file=sys.stderr)
        return build
    started = compose(root, environment, "up", "-d", "--build", "--quiet-pull")
    if started != 0:
        return started
    if not wait_ready(environment["CF_EVAL_PORT"]):
        print("3분 안에 서버가 뜨지 않았습니다. docker compose logs backend 로 확인하세요.", file=sys.stderr)
        return 1
    print(f"준비됐습니다: http://127.0.0.1:{environment['CF_EVAL_PORT']}/evaluations/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
