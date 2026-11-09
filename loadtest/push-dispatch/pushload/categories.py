"""직무 분류 정본에서 소분류 코드를 읽는다."""

from __future__ import annotations

import json
from pathlib import Path

DEFAULT_CATALOG = Path(__file__).resolve().parents[3] / "backend/src/main/resources/notification/job-categories-v1.json"


def role_codes(path: Path | None = None) -> tuple[str, ...]:
    catalog = json.loads((path or DEFAULT_CATALOG).read_text(encoding="utf-8"))
    codes = tuple(role["code"] for category in catalog["categories"] for role in category["roles"])
    if not codes or len(set(codes)) != len(codes):
        raise ValueError("직무 분류의 소분류 코드가 비었거나 중복됩니다")
    return codes
