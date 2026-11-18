"""Web Push 수신 측(브라우저 역할) 키, base64url 처리, aes128gcm 복호화(RFC 8291, RFC 8188)."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PRIVATE_VALUE_BYTES = 32
PUBLIC_POINT_BYTES = 65
AUTH_BYTES = 16
SALT_BYTES = 16
HEADER_BYTES = SALT_BYTES + 4 + 1
TAG_BYTES = 16
LAST_RECORD_DELIMITER = 2


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


def decrypt_aes128gcm(keys: SubscriberKeys, body: bytes) -> bytes:
    """레코드 하나짜리 aes128gcm 본문을 풀어 평문을 돌려준다. 형식이 틀리거나 풀리지 않으면 ValueError."""
    salt, record_size, sender_public, ciphertext = _split_header(body)
    if len(ciphertext) > record_size:
        raise ValueError("레코드가 둘 이상이라 풀 수 없습니다")
    try:
        sender = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), sender_public)
    except ValueError as error:
        raise ValueError("송신 측 공개키를 읽을 수 없습니다") from error
    shared = keys.private_key().exchange(ec.ECDH(), sender)
    ikm = _hkdf(keys.auth, shared, b"WebPush: info\x00" + keys.public_point + sender_public, 32)
    content_key = _hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    try:
        padded = AESGCM(content_key).decrypt(nonce, ciphertext, None)
    except InvalidTag as error:
        raise ValueError("복호화에 실패했습니다") from error
    unpadded = padded.rstrip(b"\x00")
    if not unpadded or unpadded[-1] != LAST_RECORD_DELIMITER:
        raise ValueError("마지막 레코드 구분자가 없습니다")
    return unpadded[:-1]


def _split_header(body: bytes) -> tuple[bytes, int, bytes, bytes]:
    if len(body) < HEADER_BYTES:
        raise ValueError("본문이 aes128gcm 헤더보다 짧습니다")
    key_id_length = body[HEADER_BYTES - 1]
    ciphertext_start = HEADER_BYTES + key_id_length
    if key_id_length != PUBLIC_POINT_BYTES or len(body) < ciphertext_start + TAG_BYTES + 1:
        raise ValueError("aes128gcm 헤더 형식이 아닙니다")
    record_size = int.from_bytes(body[SALT_BYTES:SALT_BYTES + 4], "big")
    return body[:SALT_BYTES], record_size, body[HEADER_BYTES:ciphertext_start], body[ciphertext_start:]


def _hkdf(salt: bytes, ikm: bytes, info: bytes, length: int) -> bytes:
    """HKDF-SHA256 Extract 뒤 한 블록 Expand. length는 32 이하다."""
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    return hmac.new(prk, info + b"\x01", hashlib.sha256).digest()[:length]
