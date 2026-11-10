"""MongoDB `$in` 조건이 너무 커지지 않도록 id 목록을 나눈다."""

from __future__ import annotations

from collections.abc import Sequence

BATCH_SIZE = 10_000


def chunks(values: Sequence[str]) -> list[list[str]]:
    size = BATCH_SIZE
    return [list(values[start:start + size]) for start in range(0, len(values), size)]
