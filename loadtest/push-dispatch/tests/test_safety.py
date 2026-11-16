import unittest

import re

from pushload.markers import TEST_ENDPOINT_PATTERN, TEST_LINK_PATTERN
from pushload.postings import posting_link
from pushload.subscriptions import marked_endpoint
from pushload.safety import (
    ForeignSubscriptionsError,
    TargetMismatchError,
    count_foreign,
    ensure_only_test_subscriptions,
    ensure_same_target,
    is_test_endpoint,
    subscription_counts,
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
        ensure_same_target((3, 1), (3, 1))

    def test_different_counts_stop_with_both_pairs_in_message(self):
        for api_counts in ((4, 1), (3, 0)):
            with self.subTest(api_counts=api_counts), self.assertRaises(TargetMismatchError) as raised:
                ensure_same_target(api_counts, (3, 1))
            self.assertIn("전체 3, 직무 선택 1", str(raised.exception))

    def test_counts_all_and_role_selected_subscriptions(self):
        database = FakeDatabase(push_subscriptions=[{"_id": "a", "roles": ["x"]}, {"_id": "b", "roles": []}, {"_id": "c"}])
        self.assertEqual((3, 1), subscription_counts(database.push_subscriptions))


class MarkerTest(unittest.TestCase):
    def test_endpoint_pattern_matches_generated_endpoints_only(self):
        self.assertIsNotNone(re.match(TEST_ENDPOINT_PATTERN, marked_endpoint("http://mock-push:8080", "r1")))
        self.assertIsNone(re.match(TEST_ENDPOINT_PATTERN, "http://mock-push:8080/fcm/send/real-token"))

    def test_link_pattern_matches_generated_links_only(self):
        self.assertIsNotNone(re.match(TEST_LINK_PATTERN, posting_link("r1", 1)))
        for link in ("https://loadtest.invalid.example.com/r1/1", "https://careers.example.com/loadtest.invalid/1"):
            with self.subTest(link=link):
                self.assertIsNone(re.match(TEST_LINK_PATTERN, link))


if __name__ == "__main__":
    unittest.main()
