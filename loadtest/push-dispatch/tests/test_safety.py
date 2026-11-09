import unittest

from pushload.markers import ENDPOINT_MARKER, TEST_ENDPOINT_PATTERN
from pushload.safety import (
    ForeignSubscriptionsError,
    TargetMismatchError,
    count_foreign,
    ensure_only_test_subscriptions,
    ensure_same_target,
    is_test_endpoint,
)
from tests.fakes import FakeDatabase

TEST_ENDPOINT = "http://mock-push:8080/fcm/send/loadtest-r1-abc"


class EndpointMarkerTest(unittest.TestCase):
    def test_recognizes_test_endpoints(self):
        for endpoint in (TEST_ENDPOINT, "http://10.0.0.5/fcm/send/loadtest-x"):
            with self.subTest(endpoint=endpoint):
                self.assertTrue(is_test_endpoint(endpoint))

    def test_rejects_real_or_unmarked_endpoints(self):
        for endpoint in ("https://fcm.googleapis.com/fcm/send/abc", "https://mock-push/fcm/send/loadtest-x",
                         "http://mock-push/fcm/send/real", "http://mock-push/x/fcm/send/loadtest-a", "", None, 5):
            with self.subTest(endpoint=endpoint):
                self.assertFalse(is_test_endpoint(endpoint))

    def test_counts_foreign_endpoints(self):
        self.assertEqual(2, count_foreign([TEST_ENDPOINT, "https://fcm.googleapis.com/fcm/send/x", None]))


class GuardTest(unittest.TestCase):
    def test_passes_when_only_test_subscriptions_exist(self):
        database = FakeDatabase(push_subscriptions=[{"_id": "a", "endpoint": TEST_ENDPOINT}])
        ensure_only_test_subscriptions(database.push_subscriptions)
        ensure_only_test_subscriptions(FakeDatabase().push_subscriptions)

    def test_stops_with_count_when_foreign_subscriptions_exist(self):
        database = FakeDatabase(push_subscriptions=[
            {"_id": "a", "endpoint": TEST_ENDPOINT},
            {"_id": "b", "endpoint": "https://fcm.googleapis.com/fcm/send/real-token"},
            {"_id": "c"},
        ])
        with self.assertRaises(ForeignSubscriptionsError) as raised:
            ensure_only_test_subscriptions(database.push_subscriptions)
        self.assertEqual(2, raised.exception.count)
        self.assertNotIn("real-token", str(raised.exception))
        self.assertNotIn("fcm.googleapis.com", str(raised.exception))

    def test_reads_only_endpoint_field(self):
        database = FakeDatabase(push_subscriptions=[{"_id": "a", "endpoint": TEST_ENDPOINT}])
        ensure_only_test_subscriptions(database.push_subscriptions)
        self.assertEqual([("push_subscriptions", "find", {}, {"endpoint": 1, "_id": 0})], database.log)


class TargetTest(unittest.TestCase):
    def test_same_counts_pass(self):
        ensure_same_target(3, 3)

    def test_different_or_missing_counts_stop(self):
        for api_count in (4, None, "3"):
            with self.subTest(api_count=api_count), self.assertRaises(TargetMismatchError):
                ensure_same_target(api_count, 3)


class MarkerTest(unittest.TestCase):
    def test_endpoint_pattern_matches_marker(self):
        self.assertTrue(TEST_ENDPOINT_PATTERN.endswith(ENDPOINT_MARKER))


if __name__ == "__main__":
    unittest.main()
