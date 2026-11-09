"""시험 구독 문서. 앱이 만드는 push_subscriptions 문서와 같은 모양으로 만든다."""

from __future__ import annotations

import datetime as dt
import random
import re
import secrets
import string
from collections.abc import Callable, Iterator, Sequence
from urllib.parse import urlsplit

from pushload.markers import ENDPOINT_MARKER
from pushload.runfiles import validate_run_id
from pushload.webpush import SubscriberKeys, b64url_encode, new_subscriber_keys

SUBSCRIPTION_CLASS = "com.careerform.notification.PushSubscription"
DEFAULT_ENDPOINT_LENGTH = 190
MIN_TOKEN_LENGTH = 16
MAX_ROLES = 3
TOKEN_ALPHABET = string.ascii_letters + string.digits + "-_"
_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")
_HOST_PATTERN = re.compile(r"^[A-Za-z0-9.-]+(:\d{1,5})?$")


def random_token(length: int) -> str:
    return "".join(secrets.choice(TOKEN_ALPHABET) for _ in range(length))


def new_subscription_id() -> str:
    return secrets.token_hex(16)


def marked_endpoint(mock_base: str, run_id: str, token_source: Callable[[int], str] = random_token,
                    length: int = DEFAULT_ENDPOINT_LENGTH) -> str:
    """모의 서버를 가리키는 시험 표지 endpoint. 길이는 실제 FCM endpoint와 비슷하게 맞춘다."""
    prefix = f"{_plain_http_origin(mock_base)}{ENDPOINT_MARKER}{validate_run_id(run_id)}-"
    token_length = length - len(prefix)
    if token_length < MIN_TOKEN_LENGTH:
        raise ValueError(f"endpoint 길이가 짧아 토큰을 {MIN_TOKEN_LENGTH}자 이상 넣을 수 없습니다")
    return prefix + token_source(token_length)


def _plain_http_origin(mock_base: str) -> str:
    base = mock_base.rstrip("/")
    parts = urlsplit(base)
    if parts.scheme != "http" or not _HOST_PATTERN.match(parts.netloc or "") or parts.path or parts.query or parts.fragment:
        raise ValueError("모의 서버 주소는 http://<host>[:port] 형식이어야 합니다")
    return base


def validate_options(mock_base: str, run_id: str, endpoint_length: int, unselected_ratio: float) -> None:
    """생성 전에 인자를 검사한다. 키 파일이나 문서를 만들기 전에 실패해야 실행 폴더를 다시 쓸 수 있다."""
    if not 0.0 <= unselected_ratio <= 1.0:
        raise ValueError("미선택 비율은 0 이상 1 이하여야 합니다")
    marked_endpoint(mock_base, run_id, token_source=lambda length: "x" * length, length=endpoint_length)


def choose_roles(rng: random.Random, codes: Sequence[str], unselected_ratio: float, max_roles: int = MAX_ROLES) -> tuple[str, ...] | None:
    """미선택 비율만큼 None(모든 공고 수신), 나머지는 소분류 1~max_roles개를 고른다."""
    if not 0.0 <= unselected_ratio <= 1.0:
        raise ValueError("미선택 비율은 0 이상 1 이하여야 합니다")
    if rng.random() < unselected_ratio:
        return None
    count = rng.randint(1, min(max_roles, len(codes)))
    return tuple(sorted(rng.sample(list(codes), count)))


def build_subscription(subscription_id: str, endpoint: str, keys: SubscriberKeys, roles: Sequence[str] | None,
                       now: dt.datetime) -> dict:
    if _ID_PATTERN.match(subscription_id) is None:
        raise ValueError("구독 id는 32자 소문자 hex여야 합니다")
    document = {"_id": subscription_id, "endpoint": endpoint, "p256dh": b64url_encode(keys.public_point),
                "auth": b64url_encode(keys.auth), "registeredAt": now}
    if roles is not None:
        document = {**document, "roles": list(roles), "rolesUpdatedAt": now}
    return {**document, "_class": SUBSCRIPTION_CLASS}


def generate(count: int, *, mock_base: str, run_id: str, codes: Sequence[str], unselected_ratio: float, endpoint_length: int,
             rng: random.Random, now: dt.datetime, id_factory: Callable[[], str] = new_subscription_id) -> Iterator[tuple[dict, dict]]:
    """(구독 문서, 키 기록) 쌍을 만든다. 직무 배정은 rng만 쓰므로 같은 시드면 실행 id와 상관없이 같다."""
    for _ in range(count):
        subscription_id = id_factory()
        keys = new_subscriber_keys()
        endpoint = marked_endpoint(mock_base, run_id, length=endpoint_length)
        document = build_subscription(subscription_id, endpoint, keys, choose_roles(rng, codes, unselected_ratio), now)
        yield document, {"id": subscription_id, "path": urlsplit(endpoint).path, **keys.to_record()}
