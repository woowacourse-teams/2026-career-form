import unittest
from unittest import mock

from pushload import batches, mongo_report
from tests.fakes import FakeDatabase


def delivery(identifier, posting, status, reason, attempts):
    return {"_id": identifier, "postingId": posting, "subscriptionId": f"s{identifier}", "status": status, "lastReason": reason, "attempts": attempts}


class DeliveryReportTest(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase(push_deliveries=[
            delivery(1, "p1", "ACCEPTED", "ACCEPTED", 1),
            delivery(2, "p1", "ACCEPTED", "ACCEPTED", 3),
            delivery(3, "p1", "ABANDONED", "GONE", 1),
            delivery(4, "p2", "PENDING", "RETRY_AFTER", 2),
            delivery(5, "p2", "SENDING", None, 1),
            delivery(6, "other", "ACCEPTED", "ACCEPTED", 1),
        ])

    def test_summarizes_run_deliveries(self):
        report = mongo_report.delivery_report(self.database, ["p1", "p2"], expected=6)
        self.assertEqual({
            "expected": 6,
            "found": 5,
            "lost": 2,
            "byStatus": {"ABANDONED": 1, "ACCEPTED": 2, "PENDING": 1, "SENDING": 1},
            "byStatusReason": {"ABANDONED/GONE": 1, "ACCEPTED/ACCEPTED": 2, "PENDING/RETRY_AFTER": 1, "SENDING/-": 1},
            "attempts": {"1": 3, "2": 1, "3": 1},
            "perPosting": {"p1": 3, "p2": 2},
        }, report)

    def test_reads_only_needed_fields(self):
        mongo_report.delivery_report(self.database, ["p1"], expected=None)
        name, operation, query, projection = self.database.log[0]
        self.assertEqual(("push_deliveries", "find", {"postingId": {"$in": ["p1"]}}), (name, operation, query))
        self.assertEqual({"_id": 0, "status": 1, "lastReason": 1, "attempts": 1, "postingId": 1}, projection)


class StorageReportTest(unittest.TestCase):
    def test_reports_collection_size_and_bytes_per_posting(self):
        database = FakeDatabase(job_postings=[{"_id": "p1"}, {"_id": "p2"}])
        database.push_deliveries.storage_stats = {"count": 2000, "size": 600_000, "avgObjSize": 300, "storageSize": 250_000,
                                                  "totalIndexSize": 400_000, "indexSizes": {"_id_": 1}}
        self.assertEqual({"count": 2000, "size": 600_000, "avgObjSize": 300, "storageSize": 250_000, "totalIndexSize": 400_000,
                          "postings": 2, "bytesPerPosting": 500_000.0}, mongo_report.storage_report(database))

    def test_empty_collection_has_no_per_posting_estimate(self):
        report = mongo_report.storage_report(FakeDatabase())
        self.assertEqual((0, None, None), (report["postings"], report["bytesPerPosting"], report["avgObjSize"]))


class RemainingGoneTest(unittest.TestCase):
    def test_counts_gone_subscriptions_still_stored(self):
        database = FakeDatabase(push_subscriptions=[{"_id": "s1"}, {"_id": "s2"}, {"_id": "s3"}])
        with mock.patch.object(batches, "BATCH_SIZE", 1):
            self.assertEqual(2, mongo_report.remaining_gone(database, ["s1", "s3", "s9"]))
        self.assertEqual(0, mongo_report.remaining_gone(database, []))


if __name__ == "__main__":
    unittest.main()
