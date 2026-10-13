#!/usr/bin/env python3
import argparse
import json
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.field_mapping_benchmark import (
    CONTRACT_VERSION,
    BenchmarkError,
    candidates_in_order,
    load_benchmark,
    parse_fields_response,
    parse_jev_log,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="실행 중인 백엔드로 벤치마크 요청을 보내 결과 파일을 만듭니다.")
    parser.add_argument("--labels", required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--collected-with", required=True, help="결과를 만든 백엔드 버전이나 설정 설명")
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--jev-log-command",
        help="Jev 판단 로그를 출력하는 명령. {since}, {until}을 UTC 시각으로 바꿉니다.",
    )
    parser.add_argument("--log-wait", type=float, default=1.0, help="로그 수집 전 대기 초")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--timeout", type=float, default=120.0)
    arguments = parser.parse_args()
    try:
        labels, requests = load_benchmark(Path(arguments.labels))
        sites = [
            _replay(site_id, requests[site_id], arguments)
            for site_id in (str(site["site_id"]) for site in labels["sites"])
        ]
        result = {
            "contract_version": CONTRACT_VERSION,
            "provider": arguments.provider,
            "model": arguments.model,
            "collected_with": arguments.collected_with,
            "sites": sites,
        }
        Path(arguments.output).write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    except (OSError, ValueError, urllib.error.URLError, subprocess.SubprocessError) as error:
        print(f"오류: {error}", file=sys.stderr)
        return 1
    return 0


def _replay(site_id: str, request: dict, arguments: argparse.Namespace) -> dict[str, object]:
    candidate_ids = [str(candidate["candidateId"]) for candidate in candidates_in_order(request)]
    since = datetime.now(timezone.utc)
    started = time.monotonic()
    http_request = urllib.request.Request(
        arguments.base_url.rstrip("/") + "/api/v1/fields/analyze",
        data=json.dumps(request, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(http_request, timeout=arguments.timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    latency_ms = round((time.monotonic() - started) * 1000)
    results = parse_fields_response(payload, candidate_ids)
    judgments = _jev_judgments(arguments, since, candidate_ids) if arguments.jev_log_command else {}
    print(f"{site_id}: {payload.get('analysisStatus')} {latency_ms}ms jev={len(judgments)}", file=sys.stderr)
    return {
        "site_id": site_id,
        "analysis_status": payload.get("analysisStatus"),
        "latency_ms": latency_ms,
        "candidates": [
            {
                "candidate_id": candidate_id,
                "result": results[candidate_id],
                **({"jev": judgments[candidate_id]} if candidate_id in judgments else {}),
            }
            for candidate_id in candidate_ids
        ],
    }


def _jev_judgments(arguments: argparse.Namespace, since: datetime, candidate_ids: list[str]) -> dict:
    time.sleep(arguments.log_wait)
    until = datetime.now(timezone.utc) + timedelta(seconds=1)
    command = [
        part.format(since=_timestamp(since), until=_timestamp(until))
        for part in shlex.split(arguments.jev_log_command)
    ]
    completed = subprocess.run(command, capture_output=True, text=True, check=True, timeout=60)
    return parse_jev_log(completed.stdout + completed.stderr, candidate_ids, arguments.top_k)


def _timestamp(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


if __name__ == "__main__":
    raise SystemExit(main())
