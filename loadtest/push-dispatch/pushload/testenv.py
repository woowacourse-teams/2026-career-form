"""시험 스택 설정 파일(.env.loadtest). 시험용 VAPID 키 쌍, 임시 관리 비밀번호와 그 PBKDF2 검증 문자열을 만든다.

값은 작은따옴표로 감싸 `docker compose --env-file`과 셸이 모두 글자 그대로 읽게 한다. 셸에는 스크립트가 쓰는
`LOADTEST_*` 값만 내보낸다(`set -a; . <(grep '^LOADTEST_' .env.loadtest); set +a`).
검증 문자열에 `$`가 들어 있어 따옴표 없이 두면 compose가 변수로 해석한다.
"""

from __future__ import annotations

import base64
import hashlib
import os
import re
import secrets
import tempfile
from collections.abc import Callable, Mapping
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from pushload.webpush import b64url_encode

PBKDF2_ITERATIONS = 600_000
MAX_PBKDF2_ITERATIONS = 2_000_000
SALT_BYTES = 16
MAX_SALT_BYTES = 64
DIGEST_BYTES = 32
PASSWORD_TOKEN_BYTES = 24
VAPID_SUBJECT = "mailto:loadtest@example.invalid"
LOCAL_MONGODB_URI = "mongodb://127.0.0.1:27018/career_form_loadtest"
ENV_VARIABLES = (
    "CAREER_FORM_PUSH_VAPID_PUBLIC_KEY",
    "CAREER_FORM_PUSH_VAPID_PRIVATE_KEY",
    "CAREER_FORM_PUSH_VAPID_SUBJECT",
    "CAREER_FORM_QUALITY_PASSWORD_HASH",
    "LOADTEST_ADMIN_PASSWORD",
    "LOADTEST_MONGODB_URI",
)
HEADER = (
    "# 공고 알림 발송 시험 스택 설정. make-test-env.py가 만든 시험용 값이며 저장소에 넣지 않는다.",
    "# 값은 작은따옴표로 감싸 docker compose --env-file과 셸이 모두 그대로 읽는다.",
)
_NAME_PATTERN = re.compile(r"^[A-Z_][A-Z0-9_]*$")


def vapid_key_pair() -> tuple[str, str]:
    """백엔드 VapidKeys가 읽는 형식: base64url 65바이트 비압축 P-256 공개점, base64url 32바이트 비밀값."""
    key = ec.generate_private_key(ec.SECP256R1())
    public_point = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return b64url_encode(public_point), b64url_encode(key.private_numbers().private_value.to_bytes(32, "big"))


def password_hash(password: str, salt: bytes, iterations: int = PBKDF2_ITERATIONS) -> str:
    """백엔드 QualityPassword가 받는 `pbkdf2-sha256$<반복>$<base64 salt>$<base64 digest>`를 만든다."""
    if not password:
        raise ValueError("비밀번호가 비어 있습니다")
    if not SALT_BYTES <= len(salt) <= MAX_SALT_BYTES:
        raise ValueError(f"salt는 {SALT_BYTES}~{MAX_SALT_BYTES}바이트여야 합니다")
    if not PBKDF2_ITERATIONS <= iterations <= MAX_PBKDF2_ITERATIONS:
        raise ValueError(f"반복 횟수는 {PBKDF2_ITERATIONS}~{MAX_PBKDF2_ITERATIONS}여야 합니다")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, DIGEST_BYTES)
    return f"pbkdf2-sha256${iterations}${base64.b64encode(salt).decode('ascii')}${base64.b64encode(digest).decode('ascii')}"


def loadtest_env_values(random_bytes: Callable[[int], bytes] = os.urandom,
                        token: Callable[[int], str] = secrets.token_urlsafe) -> dict[str, str]:
    public_key, private_key = vapid_key_pair()
    password = token(PASSWORD_TOKEN_BYTES)
    return {
        "CAREER_FORM_PUSH_VAPID_PUBLIC_KEY": public_key,
        "CAREER_FORM_PUSH_VAPID_PRIVATE_KEY": private_key,
        "CAREER_FORM_PUSH_VAPID_SUBJECT": VAPID_SUBJECT,
        "CAREER_FORM_QUALITY_PASSWORD_HASH": password_hash(password, random_bytes(SALT_BYTES)),
        "LOADTEST_ADMIN_PASSWORD": password,
        "LOADTEST_MONGODB_URI": LOCAL_MONGODB_URI,
    }


def render_env(values: Mapping[str, str]) -> str:
    lines = list(HEADER)
    for name, value in values.items():
        if _NAME_PATTERN.match(name) is None:
            raise ValueError(f"변수 이름 형식이 아닙니다: {name}")
        if "'" in value or "\n" in value or "\r" in value:
            raise ValueError(f"{name} 값은 작은따옴표나 줄바꿈을 담을 수 없습니다")
        lines.append(f"{name}='{value}'")
    return "\n".join(lines) + "\n"


def write_env_file(path: Path, values: Mapping[str, str], force: bool = False) -> None:
    """권한 600으로 쓴다. 파일이 이미 있으면 force 없이는 FileExistsError를 낸다."""
    content = render_env(values)
    if force:
        _replace(path, content)
        return
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        file.write(content)


def _replace(path: Path, content: str) -> None:
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            file.write(content)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise
