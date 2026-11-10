"""실행 동안 컨테이너별 CPU·메모리(docker stats)와 백엔드 actuator 지표를 일정 간격으로 resources.jsonl에 남긴다.

Ctrl+C(SIGINT)나 SIGTERM, 또는 --duration-seconds가 지나면 끝난다. 0이면 멈출 때까지 기록한다.
예: python record-resources.py --run-dir runs/20261109T101500Z-s1 --duration-seconds 900 &
SQS 방식(백엔드와 워커가 따로 뜸):
    python record-resources.py --run-dir runs/<실행 id> \
      --metrics-url backend=http://127.0.0.1:29091/actuator/prometheus,worker=http://127.0.0.1:29092/actuator/prometheus &
"""

from __future__ import annotations

import argparse
import json
import signal
import subprocess
import sys
import time
import urllib.request
from collections.abc import Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pushload import cli, runfiles  # noqa: E402
from pushload.resources import collect_sample  # noqa: E402

# 워커 컨테이너는 SQS 방식에서만 뜬다. 없는 컨테이너는 docker stats가 건너뛴다.
DEFAULT_CONTAINERS = "cf-push-loadtest-backend-1,cf-push-loadtest-worker-1,cf-push-loadtest-mongodb-1,cf-push-loadtest-mock-push-1"


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="공고 알림 시험 자원 기록")
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--containers", default=DEFAULT_CONTAINERS, help="쉼표로 구분한 컨테이너 이름")
    parser.add_argument("--metrics-url", default="http://127.0.0.1:29091/actuator/prometheus",
                        help="주소 하나, 또는 SQS 방식에서 프로세스별로 읽을 때 이름=주소를 쉼표로 이은 것(backend=...,worker=...)")
    parser.add_argument("--interval-seconds", type=float, default=5.0)
    parser.add_argument("--duration-seconds", type=float, default=900.0, help="0이면 멈출 때까지")
    return parser.parse_args(argv)


def docker_stats(containers: Sequence[str]) -> str:
    """일부 컨테이너가 없어도 나머지 줄은 쓴다. 한 줄도 없을 때만 실패로 본다."""
    completed = subprocess.run(["docker", "stats", "--no-stream", "--format", "{{json .}}", *containers],
                               capture_output=True, text=True, timeout=60, check=False)
    if completed.returncode != 0 and not completed.stdout.strip():
        raise subprocess.CalledProcessError(completed.returncode, "docker stats")
    return completed.stdout


def metrics_fetcher(url: str):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def fetch() -> str:
        with opener.open(url, timeout=5) as response:
            return response.read().decode("utf-8")

    return fetch


def metric_sources(value: str) -> str | dict[str, str]:
    """주소 하나면 그대로, `이름=주소,이름=주소`면 {이름: 주소}를 돌려준다. 섞어 쓰거나 이름이 겹치면 ValueError다."""
    parts = [part.strip() for part in value.split(",") if part.strip()]
    if not parts:
        raise ValueError("주소가 없습니다")
    if len(parts) == 1 and "=" not in parts[0].split("://", 1)[0]:
        return parts[0]
    sources: dict[str, str] = {}
    for part in parts:
        name, separator, url = part.partition("=")
        if not separator or not name.strip() or not url.strip() or "://" in name or name.strip() in sources:
            raise ValueError("이름=주소 형식이 아니거나 이름이 겹칩니다")
        sources[name.strip()] = url.strip()
    return sources


def _stop(signum, frame):
    raise KeyboardInterrupt


def main(argv: Sequence[str] | None = None, run_docker=docker_stats, fetch_metrics=None, sleep=time.sleep, clock=time.time,
         install_signals: bool = True) -> int:
    args = parse_args(argv)
    if args.interval_seconds <= 0 or args.duration_seconds < 0:
        print("입력 오류: --interval-seconds는 0보다 크고 --duration-seconds는 0 이상이어야 합니다", file=sys.stderr)
        return cli.EXIT_USAGE
    containers = [name.strip() for name in args.containers.split(",") if name.strip()]
    try:
        sources = metric_sources(args.metrics_url)
    except ValueError as error:
        print(f"입력 오류: --metrics-url {error}", file=sys.stderr)
        return cli.EXIT_USAGE
    if fetch_metrics is not None:
        fetch = fetch_metrics
    elif isinstance(sources, dict):
        fetch = {name: metrics_fetcher(url) for name, url in sources.items()}
    else:
        fetch = metrics_fetcher(sources)
    run_dir = Path(args.run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    if install_signals:
        signal.signal(signal.SIGINT, _stop)
        signal.signal(signal.SIGTERM, _stop)
    count = _record(run_dir / runfiles.RESOURCES_FILE, containers, run_docker, fetch, args, sleep, clock)
    print(f"자원 기록 {count}건을 {run_dir / runfiles.RESOURCES_FILE}에 남겼습니다")
    return cli.EXIT_OK


def _record(path: Path, containers, run_docker, fetch, args, sleep, clock) -> int:
    started = clock()
    count = 0
    with path.open("a", encoding="utf-8") as output:
        try:
            while True:
                output.write(json.dumps(collect_sample(run_docker, fetch, containers, round(clock(), 3), clock=clock)) + "\n")
                output.flush()
                count += 1
                if args.duration_seconds and clock() - started >= args.duration_seconds:
                    break
                sleep(max(0.0, started + count * args.interval_seconds - clock()))
        except KeyboardInterrupt:
            pass
    return count


if __name__ == "__main__":
    raise SystemExit(main())
