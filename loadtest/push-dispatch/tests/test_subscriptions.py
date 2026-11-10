import datetime as dt
import random
import string
import unittest
from urllib.parse import urlsplit

from pushload.categories import role_codes
from pushload.subscriptions import (
    SUBSCRIPTION_CLASS,
    build_subscription,
    choose_roles,
    generate,
    marked_endpoint,
)
from pushload.webpush import b64url_decode, new_subscriber_keys

CODES = ("a1", "a2", "b1", "b2", "c1")
NOW = dt.datetime(2026, 11, 9, 10, 0, tzinfo=dt.timezone.utc)
TOKEN_CHARACTERS = set(string.ascii_letters + string.digits + "-_")


def fixed_token(length):
    return "t" * length


class CategoriesTest(unittest.TestCase):
    def test_reads_all_minor_role_codes_from_repository_catalog(self):
        codes = role_codes()
        self.assertEqual(23, len(codes))
        self.assertEqual(len(codes), len(set(codes)))


class EndpointTest(unittest.TestCase):
    def test_builds_marked_endpoint_with_requested_length(self):
        endpoint = marked_endpoint("http://mock-push:8080", "run1", length=190)
        self.assertTrue(endpoint.startswith("http://mock-push:8080/fcm/send/loadtest-run1-"))
        self.assertEqual(190, len(endpoint))
        token = endpoint.removeprefix("http://mock-push:8080/fcm/send/loadtest-run1-")
        self.assertLessEqual(set(token), TOKEN_CHARACTERS)

    def test_uses_token_source_and_strips_trailing_slash(self):
        endpoint = marked_endpoint("http://mock-push:8080/", "run1", token_source=fixed_token, length=61)
        self.assertEqual("http://mock-push:8080/fcm/send/loadtest-run1-" + "t" * 16, endpoint)

    def test_rejects_base_that_is_not_plain_http_origin(self):
        for base in ("https://mock-push", "mock-push:8080", "http://mock-push/x", "http://", "http://mock push"):
            with self.subTest(base=base), self.assertRaises(ValueError):
                marked_endpoint(base, "run1")

    def test_rejects_length_without_room_for_token(self):
        with self.assertRaises(ValueError):
            marked_endpoint("http://mock-push:8080", "run1", length=50)

    def test_rejects_unsafe_run_id(self):
        with self.assertRaises(ValueError):
            marked_endpoint("http://mock-push:8080", "run/1")


class RolesTest(unittest.TestCase):
    def test_respects_unselected_ratio(self):
        rng = random.Random(3)
        picks = [choose_roles(rng, CODES, 0.3) for _ in range(10_000)]
        self.assertAlmostEqual(0.3, sum(pick is None for pick in picks) / len(picks), delta=0.02)

    def test_selected_roles_are_sorted_unique_known_codes(self):
        rng = random.Random(4)
        for _ in range(1_000):
            roles = choose_roles(rng, CODES, 0.0)
            self.assertTrue(1 <= len(roles) <= 3)
            self.assertEqual(tuple(sorted(set(roles))), roles)
            self.assertLessEqual(set(roles), set(CODES))

    def test_ratio_bounds(self):
        rng = random.Random(5)
        self.assertTrue(all(choose_roles(rng, CODES, 1.0) is None for _ in range(100)))
        for ratio in (-0.1, 1.1):
            with self.subTest(ratio=ratio), self.assertRaises(ValueError):
                choose_roles(rng, CODES, ratio)


class DocumentTest(unittest.TestCase):
    def test_selected_subscription_matches_app_document_shape(self):
        keys = new_subscriber_keys()
        document = build_subscription("0" * 32, "http://m/fcm/send/loadtest-r-x", keys, ("a1", "b1"), NOW)
        self.assertEqual({"_id", "_class", "endpoint", "p256dh", "auth", "registeredAt", "roles", "rolesUpdatedAt"}, set(document))
        self.assertEqual(SUBSCRIPTION_CLASS, document["_class"])
        self.assertEqual("com.careerform.notification.PushSubscription", SUBSCRIPTION_CLASS)
        self.assertEqual(keys.public_point, b64url_decode(document["p256dh"]))
        self.assertEqual(keys.auth, b64url_decode(document["auth"]))
        self.assertEqual((["a1", "b1"], NOW, NOW), (document["roles"], document["registeredAt"], document["rolesUpdatedAt"]))

    def test_unselected_subscription_has_no_role_fields(self):
        document = build_subscription("a" * 32, "http://m/fcm/send/loadtest-r-x", new_subscriber_keys(), None, NOW)
        self.assertEqual({"_id", "_class", "endpoint", "p256dh", "auth", "registeredAt"}, set(document))

    def test_rejects_identifier_that_is_not_32_hex(self):
        for value in ("xyz", "A" * 32, "0" * 31):
            with self.subTest(value=value), self.assertRaises(ValueError):
                build_subscription(value, "http://m/fcm/send/loadtest-r-x", new_subscriber_keys(), None, NOW)


class GenerateTest(unittest.TestCase):
    def run_generate(self, seed, run_id="r1", count=20):
        identifiers = iter(f"{number:032x}" for number in range(count))
        return list(generate(count, mock_base="http://mock-push:8080", run_id=run_id, codes=CODES, unselected_ratio=0.5,
                             endpoint_length=120, rng=random.Random(seed), now=NOW, id_factory=lambda: next(identifiers)))

    def test_pairs_each_document_with_its_key_record(self):
        for document, record in self.run_generate(1):
            self.assertEqual(document["_id"], record["id"])
            self.assertEqual(urlsplit(document["endpoint"]).path, record["path"])
            self.assertEqual(document["p256dh"], record["p256dh"])
            self.assertEqual(document["auth"], record["auth"])
            self.assertIn("privateKey", record)

    def test_role_assignment_depends_only_on_seed(self):
        first = [document.get("roles") for document, _ in self.run_generate(9, run_id="r1")]
        second = [document.get("roles") for document, _ in self.run_generate(9, run_id="another-run")]
        self.assertEqual(first, second)
        self.assertIn(None, first)

    def test_endpoints_are_unique(self):
        endpoints = [document["endpoint"] for document, _ in self.run_generate(2, count=200)]
        self.assertEqual(len(endpoints), len(set(endpoints)))


if __name__ == "__main__":
    unittest.main()
