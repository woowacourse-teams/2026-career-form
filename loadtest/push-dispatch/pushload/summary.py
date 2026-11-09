"""모의 서버 요청 기록에서 발송 지표를 계산한다.

수락은 2xx 응답이다. 시각은 epoch 초이고, 지연은 공고 예정 시각에서 그 (구독, 공고) 쌍이 처음 수락된 응답 시각까지다.
"""

from __future__ import annotations

import base64
import json
import math
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass

GONE_STATUSES = frozenset((404, 410))
INVALID_STATUSES = frozenset((400, 403, 413))


@dataclass(frozen=True)
class Request:
    subscription: str
    posting: str | None
    received: float
    responded: float
    status: int
    concurrency: int
    retry_after: int | None


def decode_requests(records: Iterable[Mapping], keys_by_path: Mapping[str, tuple[str, object]],
                    decrypt: Callable[[object, bytes], bytes]) -> tuple[list[Request], dict]:
    """이번 실행의 시험 구독으로 온 요청만 남기고, 암호문을 풀어 공고 id를 붙인다. 풀리지 않으면 posting은 None."""
    requests: list[Request] = []
    stats = {"records": 0, "matched": 0, "undecryptable": 0, "unknownPath": 0}
    for record in records:
        stats["records"] += 1
        subscriber = keys_by_path.get(record.get("path"))
        if subscriber is None:
            stats["unknownPath"] += 1
            continue
        subscription, keys = subscriber
        posting = _posting_id(decrypt, keys, record.get("body", ""))
        stats["matched"] += 1
        stats["undecryptable"] += posting is None
        requests.append(Request(subscription, posting, float(record["receivedAt"]), float(record["respondedAt"]), int(record["status"]),
                                int(record["concurrency"]), record.get("retryAfter")))
    return requests, stats


def _posting_id(decrypt, keys, body_base64: str) -> str | None:
    try:
        payload = json.loads(decrypt(keys, base64.b64decode(body_base64, validate=True)))
    except ValueError:
        return None
    posting = payload.get("id") if isinstance(payload, dict) else None
    return posting if isinstance(posting, str) else None


def percentile(values: Sequence[float], quantile: float) -> float | None:
    """nearest-rank 백분위. 값이 없으면 None."""
    if not 0 < quantile <= 100:
        raise ValueError("백분위는 0 초과 100 이하여야 합니다")
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(1, math.ceil(quantile / 100 * len(ordered))) - 1]


def delivery_metrics(requests: Iterable[Request], scheduled_at: Mapping[str, float]) -> dict:
    """이번 실행 공고(scheduled_at의 키)로 온 요청만 센다."""
    relevant = sorted((item for item in requests if item.posting in scheduled_at), key=lambda item: item.received)
    accepted = [item for item in relevant if 200 <= item.status < 300]
    return {
        "requests": len(relevant),
        "byStatus": {str(code): count for code, count in sorted(Counter(item.status for item in relevant).items())},
        "accepted": len(accepted),
        "duplicates": _duplicates(accepted),
        "burst": _burst(relevant, accepted, scheduled_at),
        "latencyMs": _latency(accepted, scheduled_at),
        "maxAcceptedPerSecond": max(Counter(int(item.responded) for item in accepted).values(), default=0),
        "maxConcurrency": max((item.concurrency for item in relevant), default=0),
        "longestAcceptanceGap": _longest_gap(accepted),
        "retry": _retry_correctness(relevant),
        "goneSubscriptionIds": sorted({item.subscription for item in relevant if item.status in GONE_STATUSES}),
    }


def _duplicates(accepted: Sequence[Request]) -> dict:
    counts = Counter((item.subscription, item.posting) for item in accepted)
    repeated = [count for count in counts.values() if count > 1]
    return {"pairs": len(repeated), "extra": sum(count - 1 for count in repeated)}


def _burst(relevant: Sequence[Request], accepted: Sequence[Request], scheduled_at: Mapping[str, float]) -> dict:
    if not accepted:
        return {"scheduledToLastAcceptedSeconds": None, "firstRequestToLastAcceptedSeconds": None}
    last = max(item.responded for item in accepted)
    return {"scheduledToLastAcceptedSeconds": round(last - min(scheduled_at.values()), 3),
            "firstRequestToLastAcceptedSeconds": round(last - min(item.received for item in relevant), 3)}


def _latency(accepted: Sequence[Request], scheduled_at: Mapping[str, float]) -> dict:
    first: dict[tuple[str, str], float] = {}
    for item in accepted:
        key = (item.subscription, item.posting)
        first[key] = min(first.get(key, item.responded), item.responded)
    values = [round((responded - scheduled_at[posting]) * 1000, 1) for (_, posting), responded in first.items()]
    return {"p50": percentile(values, 50), "p95": percentile(values, 95), "p99": percentile(values, 99), "count": len(values)}


def _longest_gap(accepted: Sequence[Request]) -> dict:
    times = sorted(item.responded for item in accepted)
    if len(times) < 2:
        return {"seconds": None, "from": None, "to": None}
    start, end = max(zip(times, times[1:]), key=lambda pair: pair[1] - pair[0])
    return {"seconds": round(end - start, 3), "from": start, "to": end}


def _retry_correctness(relevant: Sequence[Request]) -> dict:
    """Retry-After 전 재요청, 404·410을 받은 구독으로 다시 보낸 요청, 400·403·413을 받은 쌍으로 다시 보낸 요청."""
    before_retry_after = after_invalid = 0
    by_pair: dict[tuple[str, str], list[Request]] = defaultdict(list)
    for item in relevant:
        by_pair[(item.subscription, item.posting)].append(item)
    for attempts in by_pair.values():
        for previous, following in zip(attempts, attempts[1:]):
            allowed = previous.responded + previous.retry_after if previous.status == 429 and previous.retry_after else None
            before_retry_after += allowed is not None and following.received < allowed
        invalid = next((item.responded for item in attempts if item.status in INVALID_STATUSES), None)
        after_invalid += sum(1 for item in attempts if invalid is not None and item.received > invalid)
    gone_at: dict[str, float] = {}
    for item in relevant:
        if item.status in GONE_STATUSES and item.subscription not in gone_at:
            gone_at[item.subscription] = item.responded
    after_gone = sum(1 for item in relevant if item.subscription in gone_at and item.received > gone_at[item.subscription])
    return {"beforeRetryAfter": before_retry_after, "afterGone": after_gone, "afterInvalid": after_invalid}
