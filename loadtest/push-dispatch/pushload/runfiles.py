"""시험 실행 하나의 기록 폴더(runs/<run-id>/)와 실행 기록 run.json."""

from __future__ import annotations

import datetime as dt
import json
import os
import re
from collections.abc import Mapping
from pathlib import Path

RUN_FILE = "run.json"
KEYS_FILE = "subscriber-keys.jsonl"
REQUESTS_FILE = "requests.jsonl"
RESOURCES_FILE = "resources.jsonl"
SUMMARY_FILE = "summary.json"
RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,39}$")
_ISO_PATTERN = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$")


def validate_run_id(value: object) -> str:
    """endpoint 경로와 공고 링크에 들어가므로 영문, 숫자, 하이픈 40자 이내만 허용한다."""
    if not isinstance(value, str) or RUN_ID_PATTERN.match(value) is None:
        raise ValueError("실행 id는 영문, 숫자, 하이픈으로 된 40자 이내여야 합니다")
    return value


def new_run_id(now: dt.datetime, label: str = "") -> str:
    stamp = now.astimezone(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = re.sub(r"[^a-z0-9]+", "-", label.strip().lower()).strip("-")
    return validate_run_id(f"{stamp}-{slug}" if slug else stamp)


def read_run(run_dir: Path) -> dict:
    path = run_dir / RUN_FILE
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def with_section(run: Mapping, name: str, value: object) -> dict:
    return {**run, name: value}


def write_run(run_dir: Path, run: Mapping) -> None:
    """임시 파일에 쓴 뒤 교체해 중간에 끊겨도 깨진 run.json이 남지 않게 한다."""
    run_dir.mkdir(parents=True, exist_ok=True)
    temporary = run_dir / f".{RUN_FILE}.tmp"
    temporary.write_text(json.dumps(run, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, run_dir / RUN_FILE)


def iso(moment: dt.datetime) -> str:
    return moment.astimezone(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(text: object) -> dt.datetime:
    """Java Instant 문자열(소수점 9자리까지)을 마이크로초 단위 UTC 시각으로 읽는다."""
    match = _ISO_PATTERN.match(text) if isinstance(text, str) else None
    if match is None:
        raise ValueError("ISO 8601 시각이 아닙니다")
    whole, fraction, zone = match.groups()
    micros = (fraction or "").ljust(6, "0")[:6]
    parsed = dt.datetime.fromisoformat(f"{whole}.{micros}{'+00:00' if zone == 'Z' else zone}")
    return parsed.astimezone(dt.timezone.utc)
