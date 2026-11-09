import unittest
from unittest import mock

from pushload import cleanup
from tests.fakes import FakeDatabase

TEST_A = {"_id": "t1", "endpoint": "http://mock-push:8080/fcm/send/loadtest-r1-a"}
TEST_B = {"_id": "t2", "endpoint": "http://mock-push:8080/fcm/send/loadtest-r1-b"}
REAL = {"_id": "s1", "endpoint": "https://fcm.googleapis.com/fcm/send/real"}
TEST_POSTING = {"_id": "p1", "link": "https://loadtest.invalid/r1/1"}
REAL_POSTING = {"_id": "p2", "link": "https://careers.example.com/1"}


def database():
    return FakeDatabase(
        push_subscriptions=[TEST_A, TEST_B, REAL],
        job_postings=[TEST_POSTING, REAL_POSTING],
        push_deliveries=[
            {"_id": "d1", "postingId": "p1", "subscriptionId": "t1"},
            {"_id": "d2", "postingId": "p1", "subscriptionId": "s1"},
            {"_id": "d3", "postingId": "p2", "subscriptionId": "t2"},
            {"_id": "d4", "postingId": "p2", "subscriptionId": "s1"},
        ],
    )


class CleanupTest(unittest.TestCase):
    def test_plan_counts_only_marked_documents(self):
        target = cleanup.plan(database())
        self.assertEqual((("t1", "t2"), ("p1",), 3), (target.subscription_ids, target.posting_ids, target.deliveries))

    def test_plan_does_not_write(self):
        db = database()
        cleanup.plan(db)
        self.assertEqual([], db.writes())

    def test_execute_deletes_deliveries_then_postings_then_subscriptions(self):
        db = database()
        deleted = cleanup.execute(db, cleanup.plan(db))
        self.assertEqual({"deliveries": 3, "postings": 1, "subscriptions": 2}, deleted)
        self.assertEqual(["s1"], [document["_id"] for document in db.push_subscriptions.documents])
        self.assertEqual(["p2"], [document["_id"] for document in db.job_postings.documents])
        self.assertEqual(["d4"], [document["_id"] for document in db.push_deliveries.documents])
        order = [name for name, _, _, _ in db.writes()]
        self.assertEqual(["push_deliveries", "job_postings", "push_subscriptions"], sorted(set(order), key=order.index))

    def test_handles_identifier_lists_in_batches(self):
        with mock.patch.object(cleanup, "BATCH_SIZE", 1):
            db = database()
            target = cleanup.plan(db)
            self.assertEqual(3, target.deliveries)
            self.assertEqual({"deliveries": 3, "postings": 1, "subscriptions": 2}, cleanup.execute(db, target))

    def test_nothing_to_clean(self):
        db = FakeDatabase(push_subscriptions=[REAL], job_postings=[REAL_POSTING])
        target = cleanup.plan(db)
        self.assertEqual(((), (), 0), (target.subscription_ids, target.posting_ids, target.deliveries))
        self.assertEqual({"deliveries": 0, "postings": 0, "subscriptions": 0}, cleanup.execute(db, target))


if __name__ == "__main__":
    unittest.main()
