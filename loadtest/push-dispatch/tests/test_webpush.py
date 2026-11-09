import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from pushload.webpush import SubscriberKeys, b64url_decode, b64url_encode, decrypt_aes128gcm, new_subscriber_keys
from tests.webpush_sender import encrypt_for


class Base64UrlTest(unittest.TestCase):
    def test_round_trips_without_padding(self):
        for data in (b"", b"\x00", b"\xfb\xff", bytes(range(65))):
            with self.subTest(length=len(data)):
                encoded = b64url_encode(data)
                self.assertNotIn("=", encoded)
                self.assertEqual(data, b64url_decode(encoded))

    def test_rejects_invalid_text(self):
        for text in ("***", "a", None):
            with self.subTest(text=text), self.assertRaises(ValueError):
                b64url_decode(text)


class SubscriberKeysTest(unittest.TestCase):
    def test_new_keys_have_web_push_shapes(self):
        keys = new_subscriber_keys()
        self.assertEqual((32, 65, 4, 16), (len(keys.private_value), len(keys.public_point), keys.public_point[0], len(keys.auth)))
        derived = ec.derive_private_key(int.from_bytes(keys.private_value, "big"), ec.SECP256R1()).public_key()
        self.assertEqual(keys.public_point, derived.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))

    def test_record_round_trips(self):
        keys = new_subscriber_keys()
        record = keys.to_record()
        self.assertEqual({"privateKey", "p256dh", "auth"}, set(record))
        self.assertEqual(keys, SubscriberKeys.from_record(record))

    def test_rejects_wrong_lengths(self):
        keys = new_subscriber_keys()
        for arguments in ((keys.private_value[:31], keys.public_point, keys.auth),
                          (keys.private_value, keys.public_point[1:], keys.auth),
                          (keys.private_value, b"\x05" + keys.public_point[1:], keys.auth),
                          (keys.private_value, keys.public_point, keys.auth[:15])):
            with self.assertRaises(ValueError):
                SubscriberKeys(*arguments)

    def test_repr_hides_key_material(self):
        keys = new_subscriber_keys()
        self.assertNotIn(b64url_encode(keys.private_value), repr(keys))
        self.assertNotIn(str(keys.private_value), repr(keys))


# RFC 8291 5절 예제(Push Message Encryption Example)
RFC_PLAINTEXT = b"When I grow up, I want to be a watermelon"
RFC_UA_PRIVATE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94"
RFC_UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
RFC_AUTH = "BTBZMqHH6r4Tts7J_aSIgg"
RFC_BODY = ("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_"
            "yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN")


class DecryptTest(unittest.TestCase):
    RFC_KEYS = SubscriberKeys(b64url_decode(RFC_UA_PRIVATE), b64url_decode(RFC_UA_PUBLIC), b64url_decode(RFC_AUTH))

    def test_decrypts_rfc_8291_example(self):
        self.assertEqual(RFC_PLAINTEXT, decrypt_aes128gcm(self.RFC_KEYS, b64url_decode(RFC_BODY)))

    def test_rfc_example_keys_are_consistent(self):
        derived = self.RFC_KEYS.private_key().public_key()
        self.assertEqual(self.RFC_KEYS.public_point, derived.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))

    def test_decrypts_messages_for_generated_keys(self):
        keys = new_subscriber_keys()
        self.assertEqual(b'{"id":"abc"}', decrypt_aes128gcm(keys, encrypt_for(keys, b'{"id":"abc"}')))

    def test_rejects_tampered_wrong_key_or_truncated_body(self):
        keys = new_subscriber_keys()
        body = encrypt_for(keys, b"payload")
        tampered = body[:-1] + bytes([body[-1] ^ 1])
        for case, target_keys, target_body in (("tampered", keys, tampered), ("wrong keys", new_subscriber_keys(), body),
                                                ("truncated", keys, body[:40]), ("empty", keys, b"")):
            with self.subTest(case=case), self.assertRaises(ValueError):
                decrypt_aes128gcm(target_keys, target_body)

    def test_rejects_multiple_records(self):
        keys = new_subscriber_keys()
        with self.assertRaisesRegex(ValueError, "레코드"):
            decrypt_aes128gcm(keys, encrypt_for(keys, b"x" * 100, record_size=40))

    def test_rejects_missing_delimiter(self):
        keys = new_subscriber_keys()
        with self.assertRaisesRegex(ValueError, "구분자"):
            decrypt_aes128gcm(keys, encrypt_for(keys, b"abc", delimiter=b""))

    def test_strips_zero_padding_after_delimiter(self):
        keys = new_subscriber_keys()
        self.assertEqual(b"abc", decrypt_aes128gcm(keys, encrypt_for(keys, b"abc", padding=7)))


if __name__ == "__main__":
    unittest.main()
