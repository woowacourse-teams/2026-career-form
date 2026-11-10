"""시험 표지가 있는 구독·공고와 그 발송 문서만 지운다."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from pushload.batches import chunks
from pushload.markers import TEST_ENDPOINT_PATTERN, TEST_LINK_PATTERN

SUBSCRIPTION_FILTER = {"endpoint": {"$regex": TEST_ENDPOINT_PATTERN}}
POSTING_FILTER = {"link": {"$regex": TEST_LINK_PATTERN}}


@dataclass(frozen=True)
class CleanupPlan:
    subscription_ids: tuple[str, ...]
    posting_ids: tuple[str, ...]
    deliveries: int


def plan(db) -> CleanupPlan:
    """지울 대상을 센다. 쓰지 않는다."""
    subscription_ids = tuple(document["_id"] for document in db.push_subscriptions.find(SUBSCRIPTION_FILTER, {"_id": 1}))
    posting_ids = tuple(document["_id"] for document in db.job_postings.find(POSTING_FILTER, {"_id": 1}))
    deliveries = sum(db.push_deliveries.count_documents(query) for query in _delivery_queries(subscription_ids, posting_ids))
    return CleanupPlan(subscription_ids, posting_ids, deliveries)


def _delivery_queries(subscription_ids: Sequence[str], posting_ids: Sequence[str]) -> list[dict]:
    """시험 공고의 발송 문서, 그리고 시험 구독이 받은 나머지 발송 문서. 두 묶음은 겹치지 않는다."""
    by_posting = [{"postingId": {"$in": chunk}} for chunk in chunks(posting_ids)]
    by_subscription = [{"subscriptionId": {"$in": chunk}, "postingId": {"$nin": list(posting_ids)}} for chunk in chunks(subscription_ids)]
    return by_posting + by_subscription


def execute(db, target: CleanupPlan) -> dict:
    """발송 문서 → 공고 → 구독 순으로 지운다. 중간에 끊겨도 남은 문서는 다시 plan으로 찾을 수 있다."""
    deliveries = sum(db.push_deliveries.delete_many(query).deleted_count for query in _delivery_queries(target.subscription_ids, target.posting_ids))
    postings = sum(db.job_postings.delete_many({"_id": {"$in": chunk}}).deleted_count for chunk in chunks(target.posting_ids))
    subscriptions = sum(db.push_subscriptions.delete_many({"_id": {"$in": chunk}}).deleted_count for chunk in chunks(target.subscription_ids))
    return {"deliveries": deliveries, "postings": postings, "subscriptions": subscriptions}
