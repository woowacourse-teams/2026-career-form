"""시험 데이터를 쓰기 전 안전장치. 시험 표지가 없는 구독이 있는 DB에는 아무것도 쓰지 않는다."""

from __future__ import annotations

import re
from collections.abc import Iterable

TEST_ENDPOINT_PATTERN = re.compile(r"^http://[^/?#]+/fcm/send/loadtest-")


class ForeignSubscriptionsError(RuntimeError):
    def __init__(self, count: int):
        super().__init__(f"시험용이 아닌 구독이 {count}개 있어 멈춥니다. 시험 전용 MongoDB인지 확인하세요")
        self.count = count


def is_test_endpoint(value: object) -> bool:
    return isinstance(value, str) and TEST_ENDPOINT_PATTERN.match(value) is not None


def count_foreign(endpoints: Iterable[object]) -> int:
    return sum(1 for endpoint in endpoints if not is_test_endpoint(endpoint))


def ensure_only_test_subscriptions(collection) -> None:
    """endpoint만 읽어 센다. endpoint가 없는 문서도 시험용이 아닌 것으로 본다. 값은 출력하지 않는다."""
    documents = collection.find({}, {"endpoint": 1, "_id": 0})
    foreign = count_foreign(document.get("endpoint") for document in documents)
    if foreign:
        raise ForeignSubscriptionsError(foreign)
