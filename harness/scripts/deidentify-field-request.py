#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import read_json
from harness.lib.field_mapping_benchmark import BenchmarkError, deidentify_request


def main() -> int:
    parser = argparse.ArgumentParser(description="캡처한 fields 분석 요청을 벤치마크용 비식별 요청으로 바꿉니다.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--site-id", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--alias-map", required=True, help="원래 ID와 별칭 대응표. 저장소 밖에 보관합니다.")
    arguments = parser.parse_args()
    try:
        request, aliases = deidentify_request(read_json(arguments.input), arguments.site_id)
        _write(Path(arguments.output), request)
        _write(Path(arguments.alias_map), aliases)
    except (OSError, ValueError) as error:
        print(f"오류: {error}", file=sys.stderr)
        return 1
    return 0


def _write(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
