"""Web Push 수신 측(브라우저 역할) 키와 base64url 처리."""

from __future__ import annotations

import base64
import binascii
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

PRIVATE_VALUE_BYTES = 32
PUBLIC_POINT_BYTES = 65
AUTH_BYTES = 16


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text: object) -> bytes:
    if not isinstance(text, str):
        raise ValueError("base64url 문자열이 아닙니다")
    try:
        return base64.b64decode(text + "=" * (-len(text) % 4), altchars=b"-_", validate=True)
    except binascii.Error as error:
        raise ValueError("base64url 형식이 아닙니다") from error


@dataclass(frozen=True)
class SubscriberKeys:
    """시험 구독 하나의 P-256 비밀값, 비압축 공개점(p256dh), auth 비밀값."""

    private_value: bytes = field(repr=False)
    public_point: bytes = field(repr=False)
    auth: bytes = field(repr=False)

    def __post_init__(self):
        if len(self.private_value) != PRIVATE_VALUE_BYTES:
            raise ValueError("비밀값은 32바이트여야 합니다")
        if len(self.public_point) != PUBLIC_POINT_BYTES or self.public_point[0] != 4:
            raise ValueError("p256dh는 65바이트 비압축 P-256 점이어야 합니다")
        if len(self.auth) != AUTH_BYTES:
            raise ValueError("auth는 16바이트여야 합니다")

    def private_key(self) -> ec.EllipticCurvePrivateKey:
        return ec.derive_private_key(int.from_bytes(self.private_value, "big"), ec.SECP256R1())

    def to_record(self) -> dict:
        return {"privateKey": b64url_encode(self.private_value), "p256dh": b64url_encode(self.public_point), "auth": b64url_encode(self.auth)}

    @classmethod
    def from_record(cls, record: Mapping) -> SubscriberKeys:
        return cls(b64url_decode(record["privateKey"]), b64url_decode(record["p256dh"]), b64url_decode(record["auth"]))


def new_subscriber_keys(random_bytes: Callable[[int], bytes] = os.urandom) -> SubscriberKeys:
    key = ec.generate_private_key(ec.SECP256R1())
    public_point = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return SubscriberKeys(key.private_numbers().private_value.to_bytes(PRIVATE_VALUE_BYTES, "big"), public_point, random_bytes(AUTH_BYTES))
