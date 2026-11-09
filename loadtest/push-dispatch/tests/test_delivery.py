import json
import unittest

from pushload.delivery import Request, Subscriber, decode_requests, delivery_metrics, percentile


def request(subscription, posting, received, status, responded=None, concurrency=1, retry_after=None):
    return Request(subscription, posting, received, responded if responded is not None else received + 0.1, status, concurrency, retry_after)


SCHEDULED = {"p1": 1000.0}
REQUESTS = [
    request("s1", "p1", 1010.0, 201, 1010.1, concurrency=1),
    request("s2", "p1", 1010.0, 201, 1010.2, concurrency=2),
    request("s3", "p1", 1010.0, 429, 1010.1, retry_after=60),
    request("s4", "p1", 1011.0, 410),
    request("s5", "p1", 1012.0, 400),
    request("s3", "p1", 1050.0, 201, 1050.1),
    request("s4", "p1", 1100.0, 201, 1100.1),
    request("s5", "p1", 1200.0, 400),
    request("s2", "p1", 1300.0, 201, 1300.1),
    request("s9", "other-run", 1000.5, 201, concurrency=7),
    request("s8", None, 1000.6, 201, concurrency=6),
]


class PercentileTest(unittest.TestCase):
    def test_uses_nearest_rank(self):
        values = [50.0, 10.0, 40.0, 20.0, 30.0]
        self.assertEqual((10.0, 30.0, 50.0, 50.0), (percentile(values, 1), percentile(values, 50), percentile(values, 95), percentile(values, 100)))

    def test_empty_values_have_no_percentile(self):
        self.assertIsNone(percentile([], 50))

    def test_rejects_out_of_range_quantile(self):
        with self.assertRaises(ValueError):
            percentile([1.0], 0)


class DeliveryMetricsTest(unittest.TestCase):
    def setUp(self):
        self.metrics = delivery_metrics(REQUESTS, SCHEDULED)

    def test_counts_only_requests_for_run_postings(self):
        self.assertEqual(9, self.metrics["requests"])
        self.assertEqual({"201": 5, "400": 2, "410": 1, "429": 1}, self.metrics["byStatus"])
        self.assertEqual(5, self.metrics["accepted"])

    def test_counts_duplicates_per_subscription_and_posting(self):
        self.assertEqual({"pairs": 1, "extra": 1}, self.metrics["duplicates"])

    def test_reports_burst_completion_from_scheduled_time_and_first_request(self):
        self.assertEqual({"scheduledToLastAcceptedSeconds": 300.1, "firstRequestToLastAcceptedSeconds": 290.1}, self.metrics["burst"])

    def test_reports_latency_from_first_acceptance_per_pair(self):
        self.assertEqual({"p50": 10200.0, "p95": 100100.0, "p99": 100100.0, "count": 4}, self.metrics["latencyMs"])

    def test_reports_peak_rate_concurrency_and_longest_gap(self):
        self.assertEqual(2, self.metrics["maxAcceptedPerSecond"])
        self.assertEqual(2, self.metrics["maxConcurrency"])
        self.assertEqual({"seconds": 200.0, "from": 1100.1, "to": 1300.1}, self.metrics["longestAcceptanceGap"])

    def test_lists_gaps_of_two_seconds_or_more_in_time_order(self):
        self.assertEqual([39.9, 50.0, 200.0], [gap["seconds"] for gap in self.metrics["acceptanceGaps"]])
        self.assertEqual([1010.2, 1050.1, 1100.1], [gap["from"] for gap in self.metrics["acceptanceGaps"]])

    def test_keeps_only_five_longest_gaps(self):
        requests = [request("s1", "p1", 1000.0 + offset, 201, 1000.0 + offset) for offset in (0, 3, 7, 12, 18, 25, 33)]
        gaps = delivery_metrics(requests, SCHEDULED)["acceptanceGaps"]
        self.assertEqual([4.0, 5.0, 6.0, 7.0, 8.0], [gap["seconds"] for gap in gaps])

    def test_reports_sending_window_for_resource_summary(self):
        self.assertEqual({"from": 1010.0, "to": 1300.1}, self.metrics["window"])

    def test_window_ends_at_last_response_even_if_it_failed(self):
        requests = [request("s1", "p1", 1010.0, 201, 1010.1), request("s1", "p1", 1100.0, 503, 1100.2)]
        self.assertEqual({"from": 1010.0, "to": 1100.2}, delivery_metrics(requests, SCHEDULED)["window"])

    def test_gap_of_exactly_two_seconds_is_listed_and_shorter_is_not(self):
        requests = [request("s1", "p1", 1000.0, 201, 1000.0), request("s2", "p1", 1002.0, 201, 1002.0),
                    request("s3", "p1", 1003.999, 201, 1003.999)]
        self.assertEqual([2.0], [gap["seconds"] for gap in delivery_metrics(requests, SCHEDULED)["acceptanceGaps"]])

    def test_reports_retry_correctness(self):
        self.assertEqual({"beforeRetryAfter": 1, "afterGone": 1, "afterInvalid": 1}, self.metrics["retry"])
        self.assertEqual(["s4"], self.metrics["goneSubscriptionIds"])

    def test_handles_runs_without_acceptance(self):
        metrics = delivery_metrics([request("s1", "p1", 1010.0, 503)], SCHEDULED)
        self.assertEqual((0, None, None, None, []), (metrics["accepted"], metrics["burst"]["scheduledToLastAcceptedSeconds"],
                                                     metrics["latencyMs"]["p50"], metrics["longestAcceptanceGap"]["seconds"],
                                                     metrics["acceptanceGaps"]))
        self.assertEqual({"from": 1010.0, "to": 1010.1}, metrics["window"])
        self.assertIsNone(delivery_metrics([], SCHEDULED)["window"])


class DecodeRequestsTest(unittest.TestCase):
    def test_maps_paths_to_subscriptions_and_reads_posting_ids(self):
        keys = {"/fcm/send/loadtest-r1-a": Subscriber("s1", "key-a")}
        bodies = {"ok": json.dumps({"id": "p1"}).encode(), "bad": b"not decryptable"}

        def decrypt(key, body):
            if body == bodies["bad"]:
                raise ValueError("bad")
            return body

        records = [
            {"path": "/fcm/send/loadtest-r1-a", "body": "b2s=", "receivedAt": 1.0, "respondedAt": 1.1, "status": 201, "concurrency": 1, "retryAfter": None},
            {"path": "/fcm/send/loadtest-r1-a", "body": "YmFk", "receivedAt": 2.0, "respondedAt": 2.1, "status": 201, "concurrency": 1, "retryAfter": None},
            {"path": "/fcm/send/loadtest-other-z", "body": "b2s=", "receivedAt": 3.0, "respondedAt": 3.1, "status": 201, "concurrency": 1, "retryAfter": None},
            {"path": "/fcm/send/loadtest-r1-a", "body": "b2s=", "receivedAt": "late", "respondedAt": 3.1, "status": 201, "concurrency": 1},
            {"path": "/fcm/send/loadtest-r1-a", "receivedAt": 4.0, "respondedAt": 4.1, "concurrency": 1},
            ["not", "a", "record"],
        ]
        decoded, stats = decode_requests(records, keys, lambda key, body: json.dumps({"id": "p1"}).encode() if body == b"ok" else decrypt(key, body))
        self.assertEqual({"records": 6, "matched": 2, "undecryptable": 1, "unknownPath": 1, "invalid": 3}, stats)
        self.assertEqual([("s1", "p1"), ("s1", None)], [(item.subscription, item.posting) for item in decoded])


if __name__ == "__main__":
    unittest.main()
