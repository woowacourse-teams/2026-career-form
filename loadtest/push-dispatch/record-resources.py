"""실행 동안 컨테이너별 CPU·메모리(docker stats)와 백엔드 actuator 지표를 일정 간격으로 resources.jsonl에 남긴다.

Ctrl+C(SIGINT)나 SIGTERM, 또는 --duration-seconds가 지나면 끝난다. 0이면 멈출 때까지 기록한다.
예: python record-resources.py --run-dir runs/20261109T101500Z-s1 --duration-seconds 900 &
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

DEFAULT_CONTAINERS = "cf-push-loadtest-backend-1,cf-push-loadtest-mongodb-1,cf-push-loadtest-mock-push-1"


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="공고 알림 시험 자원 기록")
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--containers", default=DEFAULT_CONTAINERS, help="쉼표로 구분한 컨테이너 이름")
    parser.add_argument("--metrics-url", default="http://127.0.0.1:29091/actuator/prometheus")
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


def _stop(signum, frame):
    raise KeyboardInterrupt


def main(argv: Sequence[str] | None = None, run_docker=docker_stats, fetch_metrics=None, sleep=time.sleep, clock=time.time,
         install_signals: bool = True) -> int:
    args = parse_args(argv)
    if args.interval_seconds <= 0 or args.duration_seconds < 0:
        print("입력 오류: --interval-seconds는 0보다 크고 --duration-seconds는 0 이상이어야 합니다", file=sys.stderr)
        return cli.EXIT_USAGE
    containers = [name.strip() for name in args.containers.split(",") if name.strip()]
    fetch = fetch_metrics or metrics_fetcher(args.metrics_url)
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
