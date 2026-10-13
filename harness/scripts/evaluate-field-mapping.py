#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import read_json
from harness.lib.field_mapping_benchmark import evaluate_benchmark, load_benchmark


def main() -> int:
    parser = argparse.ArgumentParser(description="정답 라벨로 공급자 결과를 채점합니다.")
    parser.add_argument("--labels", required=True)
    parser.add_argument("--results", required=True, nargs="+")
    parser.add_argument("--thresholds", default="", help="Jev 재채점 기준값 목록. 예: 0.5,0.6,0.7,0.8")
    parser.add_argument("--output")
    arguments = parser.parse_args()
    try:
        thresholds = [float(value) for value in arguments.thresholds.split(",") if value.strip()]
        labels, requests = load_benchmark(Path(arguments.labels))
        report = evaluate_benchmark(
            labels, requests, [read_json(path) for path in arguments.results], thresholds
        )
        rendered = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        if arguments.output:
            Path(arguments.output).write_text(rendered, encoding="utf-8")
        print(rendered, end="")
    except (OSError, ValueError) as error:
        print(f"오류: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
