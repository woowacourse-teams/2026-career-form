"""시험 데이터를 쓰기 전 안전장치. 시험 표지가 없는 구독이 있는 DB에는 아무것도 쓰지 않는다."""

from __future__ import annotations

import re
from collections.abc import Iterable

from pushload.markers import TEST_ENDPOINT_PATTERN

_TEST_ENDPOINT = re.compile(TEST_ENDPOINT_PATTERN)


class ForeignSubscriptionsError(RuntimeError):
    def __init__(self, count: int):
        super().__init__(f"시험용이 아닌 구독이 {count}개 있어 멈춥니다. 시험 전용 MongoDB인지 확인하세요")
        self.count = count


class TargetMismatchError(RuntimeError):
    """관리 API가 보는 DB와 안전장치가 확인한 DB가 다를 때. counts는 (전체 구독 수, 직무를 고른 구독 수)다."""

    def __init__(self, api_counts: tuple[int, int], database_counts: tuple[int, int]):
        super().__init__(f"관리 API가 보는 구독 수(전체 {api_counts[0]}, 직무 선택 {api_counts[1]})와 안전장치가 확인한 DB의 구독 수"
                         f"(전체 {database_counts[0]}, 직무 선택 {database_counts[1]})가 달라 멈춥니다. "
                         "--api와 LOADTEST_MONGODB_URI가 같은 시험 스택을 가리키는지 확인하세요")
        self.api_counts = api_counts
        self.database_counts = database_counts


def subscription_counts(collection) -> tuple[int, int]:
    """(전체 구독 수, 직무를 하나 이상 고른 구독 수). 관리 API 요약의 subscriptions, roleSelectedSubscriptions와 같은 뜻이다."""
    total = selected = 0
    for document in collection.find({}, {"roles": 1, "_id": 0}):
        total += 1
        roles = document.get("roles")
        selected += isinstance(roles, list) and len(roles) > 0
    return total, selected


def ensure_same_target(api_counts: tuple[int, int], database_counts: tuple[int, int]) -> None:
    if tuple(api_counts) != tuple(database_counts):
        raise TargetMismatchError(api_counts, database_counts)


def is_test_endpoint(value: object) -> bool:
    return isinstance(value, str) and _TEST_ENDPOINT.match(value) is not None


def count_foreign(endpoints: Iterable[object]) -> int:
    return sum(1 for endpoint in endpoints if not is_test_endpoint(endpoint))


def ensure_only_test_subscriptions(collection) -> None:
    """endpoint만 읽어 센다. endpoint가 없는 문서도 시험용이 아닌 것으로 본다. 값은 출력하지 않는다."""
    documents = collection.find({}, {"endpoint": 1, "_id": 0})
    foreign = count_foreign(document.get("endpoint") for document in documents)
    if foreign:
        raise ForeignSubscriptionsError(foreign)
