"""시험 전용 MongoDB에서 발송 문서 상태와 저장 용량을 읽는다(읽기만 한다)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence

FINISHED_STATUSES = frozenset(("ACCEPTED", "ABANDONED"))
BATCH_SIZE = 10_000
STORAGE_FIELDS = ("count", "size", "avgObjSize", "storageSize", "totalIndexSize")


def delivery_report(db, posting_ids: Sequence[str], expected: int | None) -> dict:
    """이번 실행 공고의 발송 문서. 유실은 ACCEPTED도 ABANDONED도 아닌(끝나지 않은) 문서 수다."""
    projection = {"_id": 0, "status": 1, "lastReason": 1, "attempts": 1, "postingId": 1}
    statuses: Counter = Counter()
    reasons: Counter = Counter()
    attempts: Counter = Counter()
    per_posting: Counter = Counter()
    for document in db.push_deliveries.find({"postingId": {"$in": list(posting_ids)}}, projection):
        status = document.get("status")
        statuses[status] += 1
        reasons[f"{status}/{document.get('lastReason') or '-'}"] += 1
        attempts[int(document.get("attempts") or 0)] += 1
        per_posting[document.get("postingId")] += 1
    return {
        "expected": expected,
        "found": sum(statuses.values()),
        "lost": sum(count for status, count in statuses.items() if status not in FINISHED_STATUSES),
        "byStatus": dict(sorted(statuses.items())),
        "byStatusReason": dict(sorted(reasons.items())),
        "attempts": {str(count): number for count, number in sorted(attempts.items())},
        "perPosting": dict(sorted(per_posting.items())),
    }


def storage_report(db) -> dict:
    """push_deliveries의 collStats. 공고 1건당 바이트는 (데이터 + 인덱스) / 시험 DB의 공고 수다."""
    stats = next(iter(db.push_deliveries.aggregate([{"$collStats": {"storageStats": {}}}])), {}).get("storageStats", {})
    postings = db.job_postings.count_documents({})
    report = {field: stats.get(field) for field in STORAGE_FIELDS}
    total = (stats.get("size") or 0) + (stats.get("totalIndexSize") or 0)
    return {**report, "postings": postings, "bytesPerPosting": round(total / postings, 1) if postings else None}


def remaining_gone(db, subscription_ids: Sequence[str]) -> int:
    """404·410을 받았는데 아직 남아 있는 구독 수. 백엔드는 이 구독을 지워야 한다."""
    ids = list(subscription_ids)
    return sum(db.push_subscriptions.count_documents({"_id": {"$in": ids[start:start + BATCH_SIZE]}})
               for start in range(0, len(ids), BATCH_SIZE))
