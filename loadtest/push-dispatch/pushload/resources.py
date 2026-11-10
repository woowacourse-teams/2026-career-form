"""컨테이너 자원(docker stats)과 백엔드 actuator 지표를 기록하고 요약한다.

임시 EC2에는 Grafana가 없으므로 이 기록으로 CPU, 메모리, GC, 발송기 주기를 비교한다.
SQS 방식에서는 백엔드(릴레이)와 워커가 다른 프로세스라 지표를 프로세스별로 읽고, 카운터 증가도 프로세스별로 센 뒤 더한다.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
import time
from collections import defaultdict
from collections.abc import Callable, Mapping, Sequence

DEFAULT_FAMILIES = (
    "career_form_push_delivery_total",
    "career_form_push_dispatch_cycle_seconds",
    "career_form_push_send_seconds",
    "career_form_push_backlog",
    "career_form_push_relay_enqueued",
    "career_form_push_relay_delay_seconds",
    "career_form_push_queue_wait_seconds",
    "career_form_push_worker_messages",
    "jvm_gc_pause_seconds",
    "jvm_memory_used_bytes",
)
FAMILY_SUFFIXES = ("", "_count", "_sum", "_max", "_bucket", "_total", "_created")
SOURCE_LABEL = "source"
SIZE_UNITS = {"b": 1, "kb": 1000, "kib": 1024, "mb": 1000 ** 2, "mib": 1024 ** 2, "gb": 1000 ** 3, "gib": 1024 ** 3,
              "tb": 1000 ** 4, "tib": 1024 ** 4}
_SIZE_PATTERN = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]+)\s*$")
_LABEL_PATTERN = re.compile(r'([A-Za-z_][A-Za-z0-9_]*)="((?:[^"\\]|\\.)*)"')


def parse_size(text: str) -> int:
    match = _SIZE_PATTERN.match(text or "")
    unit = SIZE_UNITS.get(match.group(2).lower()) if match else None
    if unit is None:
        raise ValueError(f"크기 형식이 아닙니다: {text}")
    return int(float(match.group(1)) * unit)


def parse_docker_stats(line: str) -> dict:
    data = json.loads(line)
    used, _, limit = (data.get("MemUsage") or "--").partition("/")
    cpu = (data.get("CPUPerc") or "--").strip()
    return {"name": data["Name"], "cpuPercent": None if cpu == "--" else float(cpu.rstrip("%")),
            "memBytes": _optional_size(used), "memLimitBytes": _optional_size(limit)}


def _optional_size(text: str) -> int | None:
    return None if text.strip() in ("", "--") else parse_size(text)


def parse_prometheus(text: str, families: Sequence[str]) -> list[list]:
    """Prometheus 텍스트에서 고른 계열만 [이름, 라벨, 값]으로 돌려준다. 계열 이름 뒤 _count·_sum·_max 등을 포함한다."""
    wanted = {family + suffix for family in families for suffix in FAMILY_SUFFIXES}
    series: list[list] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, labels, value = _parse_sample(line)
        if name in wanted:
            series.append([name, labels, value])
    return series


def _parse_sample(line: str) -> tuple[str, dict, float]:
    if "{" in line:
        name, rest = line.split("{", 1)
        label_text, _, value_text = rest.rpartition("}")
        labels = {key: value.replace('\\"', '"').replace("\\n", "\n").replace("\\\\", "\\") for key, value in _LABEL_PATTERN.findall(label_text)}
    else:
        name, _, value_text = line.partition(" ")
        labels = {}
    return name.strip(), labels, float(value_text.split()[0])


def collect_sample(run_docker: Callable[[Sequence[str]], str], fetch_metrics: Callable[[], str] | Mapping[str, Callable[[], str]],
                   containers: Sequence[str], now: float, clock: Callable[[], float] = time.time) -> dict:
    """한 시점의 기록. 한쪽이 실패해도 멈추지 않고 errors에 종류만 남긴다.

    지표는 바로 읽혀 at과 시각이 맞으므로 먼저 읽는다. docker stats는 1~2초 걸리므로 잰 구간을 dockerFrom·dockerTo로 남긴다.
    fetch_metrics가 {이름: 읽는 함수}면 프로세스마다 따로 읽고 모든 계열에 source 라벨을 붙인다.
    """
    sample = {"at": now, "containers": {}, "metrics": [], "errors": []}
    if isinstance(fetch_metrics, Mapping):
        for source, fetch in fetch_metrics.items():
            try:
                sample["metrics"] += [[name, {**labels, SOURCE_LABEL: source}, value]
                                      for name, labels, value in parse_prometheus(fetch(), DEFAULT_FAMILIES)]
            except (OSError, ValueError) as error:
                sample["errors"].append(f"metrics[{source}]: {type(error).__name__}")
    else:
        try:
            sample["metrics"] = parse_prometheus(fetch_metrics(), DEFAULT_FAMILIES)
        except (OSError, ValueError) as error:
            sample["errors"].append(f"metrics: {type(error).__name__}")
    sample["dockerFrom"] = round(clock(), 3)
    try:
        stats = [parse_docker_stats(line) for line in run_docker(containers).splitlines() if line.strip()]
        sample["containers"] = {item["name"]: item for item in stats}
    except (OSError, subprocess.SubprocessError, ValueError, KeyError) as error:
        sample["errors"].append(f"docker: {type(error).__name__}")
    sample["dockerTo"] = round(clock(), 3)
    return sample


def summarize_resources(samples: Sequence[Mapping], window: Mapping | None = None) -> dict:
    """window({"from", "to"} epoch 초)가 있으면 그 구간과 바로 다음 표본만 쓴다. 카운터 증가는 구간 직전 표본부터 센다."""
    if not samples:
        return {"containers": {}, "backend": None, "samples": 0, "errors": 0, "seconds": None, "window": window}
    selected, baseline = _select(samples, window)
    with_metrics = [sample for sample in [*baseline, *selected] if sample.get("metrics")]
    return {
        "containers": _container_summary(_container_samples(samples, window, selected)),
        "backend": _backend_summary(with_metrics) if with_metrics else None,
        "samples": len(selected),
        "errors": sum(len(sample.get("errors", ())) for sample in selected),
        "seconds": round(selected[-1]["at"] - selected[0]["at"], 3) if selected else None,
        "window": window,
    }


def _select(samples: Sequence[Mapping], window: Mapping | None) -> tuple[list[Mapping], list[Mapping]]:
    ordered = sorted(samples, key=lambda sample: sample["at"])
    if window is None:
        return ordered, []
    inside = [sample for sample in ordered if window["from"] <= sample["at"] <= window["to"]]
    after = [sample for sample in ordered if sample["at"] > window["to"]][:1]
    before = [sample for sample in ordered if sample["at"] < window["from"] and sample.get("metrics")][-1:]
    return inside + after, before


def _container_samples(samples: Sequence[Mapping], window: Mapping | None, selected: Sequence[Mapping]) -> Sequence[Mapping]:
    """docker stats가 잰 구간(dockerFrom~dockerTo)이 발송 구간과 겹치는 표본. 그 기록이 없는 옛 표본은 지표 시각으로 고른 표본을 쓴다."""
    if window is None or not all("dockerFrom" in sample and "dockerTo" in sample for sample in samples):
        return selected
    return [sample for sample in sorted(samples, key=lambda item: item["at"])
            if sample["dockerFrom"] <= window["to"] and sample["dockerTo"] >= window["from"]]


def _container_summary(samples: Sequence[Mapping]) -> dict:
    values: dict[str, dict[str, list]] = defaultdict(lambda: {"cpu": [], "memory": [], "samples": 0})
    for sample in samples:
        for name, stats in sample.get("containers", {}).items():
            values[name]["samples"] += 1
            if stats.get("cpuPercent") is not None:
                values[name]["cpu"].append(stats["cpuPercent"])
            if stats.get("memBytes") is not None:
                values[name]["memory"].append(stats["memBytes"])
    return {name: {"cpuPercentAvg": round(sum(item["cpu"]) / len(item["cpu"]), 2) if item["cpu"] else None,
                   "cpuPercentMax": max(item["cpu"], default=None), "memBytesMax": max(item["memory"], default=None),
                   "samples": item["samples"]} for name, item in sorted(values.items())}


def _backend_summary(samples: Sequence[Mapping]) -> dict:
    """발송 지표 요약. 카운터 증가는 프로세스별로 센 뒤 더한다. 한 프로세스가 다시 떠도 다른 프로세스의 값을 다시 세지 않는다."""
    groups = _by_source(samples)
    cycles = _total_increase(groups, "career_form_push_dispatch_cycle_seconds_count")
    cycle_seconds = _total_increase(groups, "career_form_push_dispatch_cycle_seconds_sum")
    jvm = {source: _jvm_summary(group) for source, group in groups.items()}
    summary = {
        "dispatchCycles": round(cycles),
        "dispatchCycleSecondsAvg": round(cycle_seconds / cycles, 6) if cycles else None,
        "dispatchCycleSecondsMax": _group_max(groups, "career_form_push_dispatch_cycle_seconds_max"),
        "gcPauses": sum(item["gcPauses"] for item in jvm.values()),
        "gcPauseSecondsTotal": round(sum(item["gcPauseSecondsTotal"] for item in jvm.values()), 6),
        "heapBytesMax": max(item["heapBytesMax"] for item in jvm.values()),
        "deliveries": _labelled_increase(groups, "career_form_push_delivery_total", ("outcome", "reason")),
        "queue": _queue_summary(groups),
    }
    if any(source for source in groups):
        summary["processes"] = jvm
    return summary


def _by_source(samples: Sequence[Mapping]) -> dict[str, list[Mapping]]:
    """source 라벨별 표본 목록. 그 시점에 지표를 읽지 못한 프로세스의 표본은 뺀다(0으로 보면 재시작으로 잘못 센다)."""
    sources = sorted({labels.get(SOURCE_LABEL, "") for sample in samples for _, labels, _ in sample["metrics"]})
    groups = {}
    for source in sources:
        own = [[series for series in sample["metrics"] if series[1].get(SOURCE_LABEL, "") == source] for sample in samples]
        groups[source] = [{"metrics": metrics} for metrics in own if metrics]
    return groups


def _jvm_summary(group: Sequence[Mapping]) -> dict:
    return {"gcPauses": round(_increase([_sum(sample, "jvm_gc_pause_seconds_count") for sample in group])),
            "gcPauseSecondsTotal": round(_increase([_sum(sample, "jvm_gc_pause_seconds_sum") for sample in group]), 6),
            "heapBytesMax": max(_sum(sample, "jvm_memory_used_bytes", area="heap") for sample in group)}


def _queue_summary(groups: Mapping[str, Sequence[Mapping]]) -> dict | None:
    """SQS 방식의 릴레이·큐 지표. 그 지표가 한 번도 보이지 않으면(지금 방식) None이다."""
    names = {name for group in groups.values() for sample in group for name, _, _ in sample["metrics"]}
    if not any(name.startswith(("career_form_push_relay_", "career_form_push_queue_", "career_form_push_worker_")) for name in names):
        return None
    relay_count = _total_increase(groups, "career_form_push_relay_delay_seconds_count")
    wait_count = _total_increase(groups, "career_form_push_queue_wait_seconds_count")
    return {
        "enqueued": _labelled_increase(groups, "career_form_push_relay_enqueued_total", ("result",)),
        "relayDelaySecondsAvg": _average(_total_increase(groups, "career_form_push_relay_delay_seconds_sum"), relay_count),
        "relayDelaySecondsMax": _group_max(groups, "career_form_push_relay_delay_seconds_max"),
        "queueWaitSecondsAvg": _average(_total_increase(groups, "career_form_push_queue_wait_seconds_sum"), wait_count),
        "queueWaitSecondsMax": _group_max(groups, "career_form_push_queue_wait_seconds_max"),
        "workerMessages": _labelled_increase(groups, "career_form_push_worker_messages_total", ("result",)),
    }


def _average(total: float, count: float) -> float | None:
    return round(total / count, 6) if count else None


def _total_increase(groups: Mapping[str, Sequence[Mapping]], name: str, **labels: str) -> float:
    return sum(_increase([_sum(sample, name, **labels) for sample in group]) for group in groups.values())


def _group_max(groups: Mapping[str, Sequence[Mapping]], name: str) -> float | None:
    return max((_max(sample, name) for group in groups.values() for sample in group), default=None)


def _labelled_increase(groups: Mapping[str, Sequence[Mapping]], name: str, keys: Sequence[str]) -> dict:
    """라벨 값 조합별 증가. 키는 라벨 값을 /로 이은 것이다."""
    combos = sorted({tuple(labels.get(key, "-") for key in keys) for group in groups.values() for sample in group
                     for series_name, labels, _ in sample["metrics"] if series_name == name})
    increases = {"/".join(combo): _total_increase(groups, name, **dict(zip(keys, combo))) for combo in combos}
    return {key: round(value) for key, value in increases.items() if value}


def _sum(sample: Mapping, name: str, **labels: str) -> float:
    return sum(value for series_name, series_labels, value in sample["metrics"]
               if series_name == name and all(series_labels.get(key) == expected for key, expected in labels.items()) and not math.isnan(value))


def _max(sample: Mapping, name: str) -> float:
    return max((value for series_name, _, value in sample["metrics"] if series_name == name and not math.isnan(value)), default=0.0)


def _increase(values: Sequence[float]) -> float:
    """Prometheus increase처럼 센다. 값이 줄면 백엔드가 다시 뜬 것으로 보고 새 값부터 더한다."""
    return sum(current - previous if current >= previous else current for previous, current in zip(values, values[1:]))
