"""진입 스크립트가 함께 쓰는 환경변수, MongoDB 연결, 종료 코드."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

EXIT_OK = 0
EXIT_FAILURE = 1
EXIT_USAGE = 2
EXIT_UNSAFE = 3


class UsageError(Exception):
    """입력이나 설정이 잘못됐다. 메시지에 비밀값을 넣지 않는다."""


def require_env(environ: Mapping[str, str], name: str) -> str:
    value = environ.get(name, "")
    if not value.strip():
        raise UsageError(f"환경변수 {name}가 필요합니다")
    return value


def connect_database(uri: str):
    """URI의 기본 DB를 돌려준다. 연결은 첫 연산 때 맺는다. 오류 메시지에 URI를 넣지 않는다."""
    from pymongo import MongoClient
    from pymongo.errors import ConfigurationError, InvalidURI

    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=5000, appname="cf-push-loadtest")
    except (ConfigurationError, InvalidURI, ValueError):
        raise UsageError("LOADTEST_MONGODB_URI 형식을 읽을 수 없습니다") from None
    try:
        return client.get_default_database()
    except ConfigurationError:
        client.close()
        raise UsageError("LOADTEST_MONGODB_URI에 DB 이름이 필요합니다(예: mongodb://127.0.0.1:27018/career_form_loadtest)") from None


def parse_notes(notes: Iterable[str]) -> dict[str, str]:
    """`--note key=value` 목록을 dict로 바꾼다."""
    parsed: dict[str, str] = {}
    for note in notes:
        key, separator, value = note.partition("=")
        if not separator or not key.strip():
            raise UsageError(f"메모는 key=value 형식이어야 합니다: {note}")
        if key in parsed:
            raise UsageError(f"메모 키가 중복됩니다: {key}")
        parsed[key.strip()] = value.strip()
    return parsed
