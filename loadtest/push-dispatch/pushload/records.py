"""실행 폴더의 JSONL 기록을 읽고 모양을 검사한다. 모양이 틀린 줄은 건너뛰고 수를 센다."""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path

from pushload.delivery import Subscriber
from pushload.webpush import SubscriberKeys


def read_jsonl(path: Path) -> tuple[list[object], int]:
    """파일이 없으면 빈 목록. 깨진 줄(쓰는 중 끊긴 마지막 줄 등)은 건너뛰고 수를 센다."""
    if not path.exists():
        return [], 0
    records: list[object] = []
    skipped = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except ValueError:
            skipped += 1
    return records, skipped


def load_subscribers(key_records: Sequence[object]) -> tuple[dict[str, Subscriber], int]:
    """키 기록을 요청 경로로 찾는 구독으로 바꾼다."""
    subscribers: dict[str, Subscriber] = {}
    invalid = 0
    for record in key_records:
        try:
            subscribers[record["path"]] = Subscriber(record["id"], SubscriberKeys.from_record(record))
        except (KeyError, TypeError, ValueError):
            invalid += 1
    return subscribers, invalid


def valid_samples(samples: Sequence[object]) -> tuple[list[dict], int]:
    """자원 기록 가운데 요약에 쓸 수 있는 모양만 남긴다."""
    valid = [sample for sample in samples if _valid_sample(sample)]
    return valid, len(samples) - len(valid)


def _valid_sample(sample: object) -> bool:
    if not isinstance(sample, dict) or isinstance(sample.get("at"), bool) or not isinstance(sample.get("at"), (int, float)):
        return False
    containers, metrics, errors = sample.get("containers", {}), sample.get("metrics", []), sample.get("errors", [])
    return (isinstance(containers, dict) and all(isinstance(stats, dict) for stats in containers.values())
            and isinstance(metrics, list) and all(_valid_series(series) for series in metrics) and isinstance(errors, list))


def _valid_series(series: object) -> bool:
    return (isinstance(series, list) and len(series) == 3 and isinstance(series[0], str) and isinstance(series[1], dict)
            and isinstance(series[2], (int, float)) and not isinstance(series[2], bool))
