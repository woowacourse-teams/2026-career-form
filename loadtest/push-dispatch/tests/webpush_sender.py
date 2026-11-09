"""테스트용 RFC 8291 송신 측(애플리케이션 서버) 암호화. 백엔드 라이브러리가 하는 일을 흉내 낸다."""

import hashlib
import hmac
import os

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _expand(salt, ikm, info, length):
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    return hmac.new(prk, info + b"\x01", hashlib.sha256).digest()[:length]


def encrypt_for(keys, plaintext, record_size=4096, salt=None, delimiter=b"\x02", padding=0):
    sender = ec.generate_private_key(ec.SECP256R1())
    sender_public = sender.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    receiver = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), keys.public_point)
    salt = salt or os.urandom(16)
    ikm = _expand(keys.auth, sender.exchange(ec.ECDH(), receiver), b"WebPush: info\x00" + keys.public_point + sender_public, 32)
    content_key = _expand(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _expand(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    ciphertext = AESGCM(content_key).encrypt(nonce, plaintext + delimiter + b"\x00" * padding, None)
    return salt + record_size.to_bytes(4, "big") + bytes([len(sender_public)]) + sender_public + ciphertext
