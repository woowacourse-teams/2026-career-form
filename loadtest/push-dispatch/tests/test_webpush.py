import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from pushload.webpush import SubscriberKeys, b64url_decode, b64url_encode, new_subscriber_keys


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


if __name__ == "__main__":
    unittest.main()
