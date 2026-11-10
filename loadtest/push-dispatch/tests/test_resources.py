import json
import math
import subprocess
import unittest

from pushload.resources import collect_sample, parse_docker_stats, parse_prometheus, parse_size, summarize_resources

DOCKER_LINE = json.dumps({"BlockIO": "0B / 0B", "CPUPerc": "12.34%", "Container": "abc", "ID": "abc", "MemPerc": "6.20%",
                          "MemUsage": "123.4MiB / 1.944GiB", "Name": "cf-push-loadtest-backend-1", "NetIO": "1kB / 2kB", "PIDs": "40"})
PROMETHEUS = """# HELP career_form_push_delivery_total
# TYPE career_form_push_delivery_total counter
career_form_push_delivery_total{env="local",outcome="accepted",reason="ACCEPTED",service="career-form-backend"} 10.0
career_form_push_delivery_total{env="local",outcome="abandoned",reason="GONE",service="career-form-backend"} 1.0
career_form_push_dispatch_cycle_seconds_count{env="local"} 3.0
career_form_push_dispatch_cycle_seconds_sum{env="local"} 1.5
career_form_push_dispatch_cycle_seconds_max{env="local"} 0.9
jvm_gc_pause_seconds_count{action="end of minor GC",cause="G1 Evacuation Pause"} 4.0
jvm_gc_pause_seconds_sum{action="end of minor GC",cause="G1 Evacuation Pause"} 0.04
jvm_memory_used_bytes{area="heap",id="G1 Eden Space"} 1.0E8
jvm_memory_used_bytes{area="heap",id="G1 Old Gen"} 5.0E7
jvm_memory_used_bytes{area="nonheap",id="Metaspace"} 9.9E7
process_cpu_usage 0.5
career_form_push_send_seconds{outcome="accepted",quantile="0.5",note="a \\"quoted\\", value"} NaN
"""


class ParseSizeTest(unittest.TestCase):
    def test_reads_docker_size_units(self):
        cases = {"0B": 0, "512B": 512, "1.5kB": 1500, "2KiB": 2048, "123.4MiB": int(123.4 * 1024 ** 2), "1MB": 1_000_000,
                 "1.944GiB": int(1.944 * 1024 ** 3), "2GB": 2_000_000_000}
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(expected, parse_size(text))

    def test_rejects_unknown_format(self):
        for text in ("", "12XB", "abc"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_size(text)


class DockerStatsTest(unittest.TestCase):
    def test_reads_cpu_and_memory(self):
        self.assertEqual({"name": "cf-push-loadtest-backend-1", "cpuPercent": 12.34, "memBytes": int(123.4 * 1024 ** 2),
                          "memLimitBytes": int(1.944 * 1024 ** 3)}, parse_docker_stats(DOCKER_LINE))

    def test_missing_values_become_none(self):
        line = json.dumps({"Name": "stopped", "CPUPerc": "--", "MemUsage": "-- / --"})
        self.assertEqual({"name": "stopped", "cpuPercent": None, "memBytes": None, "memLimitBytes": None}, parse_docker_stats(line))


class PrometheusTest(unittest.TestCase):
    def test_keeps_requested_families_with_labels(self):
        series = parse_prometheus(PROMETHEUS, ("career_form_push_delivery_total", "jvm_memory_used_bytes", "career_form_push_send_seconds"))
        names = [name for name, _, _ in series]
        self.assertEqual(["career_form_push_delivery_total"] * 2 + ["jvm_memory_used_bytes"] * 3 + ["career_form_push_send_seconds"], names)
        self.assertEqual({"env": "local", "outcome": "accepted", "reason": "ACCEPTED", "service": "career-form-backend"}, series[0][1])
        self.assertEqual(1.0e8, series[2][2])
        self.assertEqual('a "quoted", value', series[5][1]["note"])
        self.assertTrue(math.isnan(series[5][2]))

    def test_family_prefix_covers_summary_suffixes(self):
        names = {name for name, _, _ in parse_prometheus(PROMETHEUS, ("career_form_push_dispatch_cycle_seconds",))}
        self.assertEqual({"career_form_push_dispatch_cycle_seconds_count", "career_form_push_dispatch_cycle_seconds_sum",
                          "career_form_push_dispatch_cycle_seconds_max"}, names)

    def test_does_not_match_other_metric_with_same_prefix_word(self):
        self.assertEqual([], parse_prometheus("jvm_gc_pause_seconds_extra_count 1\n", ("jvm_gc_pause_seconds",)))
        self.assertEqual([], parse_prometheus("process_cpu_usage 0.5\n", ("process_cpu",)))


class CollectSampleTest(unittest.TestCase):
    def test_combines_docker_and_metrics(self):
        sample = collect_sample(lambda containers: DOCKER_LINE + "\n", lambda: PROMETHEUS, ["cf-push-loadtest-backend-1"], 100.0)
        self.assertEqual(100.0, sample["at"])
        self.assertEqual(12.34, sample["containers"]["cf-push-loadtest-backend-1"]["cpuPercent"])
        self.assertTrue(any(name == "jvm_gc_pause_seconds_sum" for name, _, _ in sample["metrics"]))
        self.assertEqual([], sample["errors"])

    def test_records_errors_without_stopping(self):
        def failing_docker(containers):
            raise subprocess.CalledProcessError(1, ["docker"])

        def failing_metrics():
            raise OSError("connection refused")

        sample = collect_sample(failing_docker, failing_metrics, ["x"], 5.0)
        self.assertEqual(({}, []), (sample["containers"], sample["metrics"]))
        self.assertEqual(["metrics: OSError", "docker: CalledProcessError"], sample["errors"])

    def test_reads_metrics_before_slow_docker_stats(self):
        calls = []

        def docker(containers):
            calls.append("docker")
            return DOCKER_LINE

        def metrics():
            calls.append("metrics")
            return PROMETHEUS

        collect_sample(docker, metrics, ["cf-push-loadtest-backend-1"], 1.0)
        self.assertEqual(["metrics", "docker"], calls)


def sample(at, cpu, memory, cycles, cycle_sum, cycle_max, gc_count, gc_sum, heap, accepted):
    return {"at": at, "containers": {"backend": {"name": "backend", "cpuPercent": cpu, "memBytes": memory, "memLimitBytes": 10}},
            "metrics": [
                ["career_form_push_dispatch_cycle_seconds_count", {}, cycles],
                ["career_form_push_dispatch_cycle_seconds_sum", {}, cycle_sum],
                ["career_form_push_dispatch_cycle_seconds_max", {}, cycle_max],
                ["jvm_gc_pause_seconds_count", {"cause": "a"}, gc_count],
                ["jvm_gc_pause_seconds_sum", {"cause": "a"}, gc_sum],
                ["jvm_memory_used_bytes", {"area": "heap", "id": "eden"}, heap],
                ["jvm_memory_used_bytes", {"area": "nonheap", "id": "meta"}, 999.0],
                ["career_form_push_delivery_total", {"outcome": "accepted", "reason": "ACCEPTED"}, accepted],
            ], "errors": []}


class SummarizeResourcesTest(unittest.TestCase):
    def test_summarizes_containers_and_backend_deltas(self):
        samples = [sample(0, 10.0, 100, 2, 0.2, 0.1, 1, 0.01, 50.0, 0),
                   sample(5, 30.0, 300, 3, 2.2, 2.0, 3, 0.05, 80.0, 900),
                   sample(10, None, 200, 4, 2.4, 1.0, 4, 0.06, 70.0, 1000)]
        summary = summarize_resources(samples)
        self.assertEqual({"backend": {"cpuPercentAvg": 20.0, "cpuPercentMax": 30.0, "memBytesMax": 300, "samples": 3}}, summary["containers"])
        backend = summary["backend"]
        self.assertEqual((2, 1.1, 2.0), (backend["dispatchCycles"], backend["dispatchCycleSecondsAvg"], backend["dispatchCycleSecondsMax"]))
        self.assertEqual((3, 0.05, 80.0), (backend["gcPauses"], backend["gcPauseSecondsTotal"], backend["heapBytesMax"]))
        self.assertEqual({"accepted/ACCEPTED": 1000}, backend["deliveries"])
        self.assertEqual((3, 0, 10.0, None), (summary["samples"], summary["errors"], summary["seconds"], summary["window"]))

    def test_counter_increase_survives_backend_restart(self):
        samples = [sample(at, 1.0, 1, cycles, 0.0, 0.0, 0, 0.0, 1.0, accepted)
                   for at, cycles, accepted in ((0, 5, 100), (5, 10, 600), (10, 2, 50), (15, 4, 450))]
        backend = summarize_resources(samples)["backend"]
        self.assertEqual((9, {"accepted/ACCEPTED": 950}), (backend["dispatchCycles"], backend["deliveries"]))

    def test_handles_no_samples(self):
        self.assertEqual({"containers": {}, "backend": None, "samples": 0, "errors": 0, "seconds": None, "window": None}, summarize_resources([]))

    def test_window_keeps_sending_period_and_counts_increase_from_previous_sample(self):
        samples = [sample(at, cpu, 100, cycles, 0.0, 0.0, 0, 0.0, 1.0, accepted)
                   for at, cpu, cycles, accepted in ((0, 90.0, 1, 0), (5, 1.0, 2, 0), (10, 40.0, 3, 600), (15, 20.0, 4, 1000), (20, 1.0, 5, 1000))]
        summary = summarize_resources(samples, {"from": 6.0, "to": 12.0})
        self.assertEqual((2, 30.0, 40.0), (summary["samples"], summary["containers"]["backend"]["cpuPercentAvg"], summary["containers"]["backend"]["cpuPercentMax"]))
        self.assertEqual((2, {"accepted/ACCEPTED": 1000}), (summary["backend"]["dispatchCycles"], summary["backend"]["deliveries"]))
        self.assertEqual({"from": 6.0, "to": 12.0}, summary["window"])

    def test_container_values_use_docker_measurement_time(self):
        def timed(at, docker_from, cpu):
            return {**sample(at, cpu, 100, 1, 0.0, 0.0, 0, 0.0, 1.0, 0), "dockerFrom": docker_from, "dockerTo": docker_from + 2.0}

        samples = [timed(0, 1, 1.0), timed(4.6, 5.6, 127.0), timed(9.6, 10.6, 0.3), timed(14.6, 15.6, 0.7)]
        summary = summarize_resources(samples, {"from": 5.0, "to": 10.4})
        self.assertEqual((127.0, 1), (summary["containers"]["backend"]["cpuPercentMax"], summary["containers"]["backend"]["samples"]))

    def test_records_docker_measurement_interval(self):
        ticks = iter([10.0, 11.5])
        recorded = collect_sample(lambda containers: DOCKER_LINE, lambda: PROMETHEUS, ["x"], 9.9, clock=lambda: next(ticks))
        self.assertEqual((10.0, 11.5), (recorded["dockerFrom"], recorded["dockerTo"]))

    def test_window_bounds_are_inclusive(self):
        samples = [sample(at, 10.0, 100, 1, 0.0, 0.0, 0, 0.0, 1.0, 0) for at in (0, 5, 10, 15)]
        self.assertEqual(3, summarize_resources(samples, {"from": 5.0, "to": 10.0})["samples"])


def process_sample(at, sources):
    """프로세스별 지표를 가진 표본. sources는 {이름: (주기 수, GC 횟수, 힙, 수락 수)}다. 빠진 프로세스는 그 시점에 지표를 읽지 못한 것이다."""
    metrics = []
    for name, (cycles, gc_count, heap, accepted) in sources.items():
        labels = {"source": name}
        metrics += [["career_form_push_dispatch_cycle_seconds_count", dict(labels), cycles],
                    ["career_form_push_dispatch_cycle_seconds_sum", dict(labels), cycles * 0.5],
                    ["career_form_push_dispatch_cycle_seconds_max", dict(labels), 0.5 if cycles else 0.0],
                    ["jvm_gc_pause_seconds_count", {**labels, "cause": "a"}, gc_count],
                    ["jvm_gc_pause_seconds_sum", {**labels, "cause": "a"}, gc_count * 0.01],
                    ["jvm_memory_used_bytes", {**labels, "area": "heap", "id": "eden"}, heap],
                    ["career_form_push_delivery_total", {**labels, "outcome": "accepted", "reason": "ACCEPTED"}, accepted]]
    return {"at": at, "containers": {}, "metrics": metrics, "errors": []}


class MultiProcessTest(unittest.TestCase):
    def test_collects_each_source_with_a_source_label(self):
        sample = collect_sample(lambda containers: DOCKER_LINE, {"backend": lambda: PROMETHEUS, "worker": lambda: PROMETHEUS}, ["x"], 1.0)
        sources = {labels.get("source") for _, labels, _ in sample["metrics"]}
        self.assertEqual({"backend", "worker"}, sources)
        self.assertEqual([], sample["errors"])

    def test_one_failing_source_keeps_the_other(self):
        def failing():
            raise OSError("connection refused")

        sample = collect_sample(lambda containers: DOCKER_LINE, {"backend": lambda: PROMETHEUS, "worker": failing}, ["x"], 1.0)
        self.assertEqual({"backend"}, {labels.get("source") for _, labels, _ in sample["metrics"]})
        self.assertEqual(["metrics[worker]: OSError"], sample["errors"])

    def test_sums_counters_per_process_and_reports_jvm_per_process(self):
        samples = [process_sample(0, {"backend": (1, 1, 50.0, 0), "worker": (0, 2, 70.0, 0)}),
                   process_sample(5, {"backend": (2, 2, 60.0, 0), "worker": (0, 5, 90.0, 600)}),
                   process_sample(10, {"backend": (3, 2, 55.0, 0), "worker": (0, 6, 80.0, 1000)})]
        backend = summarize_resources(samples)["backend"]
        self.assertEqual((2, 0.5, {"accepted/ACCEPTED": 1000}), (backend["dispatchCycles"], backend["dispatchCycleSecondsAvg"], backend["deliveries"]))
        self.assertEqual(5, backend["gcPauses"])
        self.assertEqual({"backend": {"gcPauses": 1, "gcPauseSecondsTotal": 0.01, "heapBytesMax": 60.0},
                          "worker": {"gcPauses": 4, "gcPauseSecondsTotal": 0.04, "heapBytesMax": 90.0}}, backend["processes"])
        self.assertEqual(90.0, backend["heapBytesMax"])

    def test_worker_restart_does_not_recount_the_other_process(self):
        samples = [process_sample(0, {"backend": (10, 0, 1.0, 0), "worker": (0, 0, 1.0, 100)}),
                   process_sample(5, {"backend": (11, 0, 1.0, 0), "worker": (0, 0, 1.0, 600)}),
                   process_sample(10, {"backend": (12, 0, 1.0, 0), "worker": (0, 0, 1.0, 50)}),
                   process_sample(15, {"backend": (13, 0, 1.0, 0), "worker": (0, 0, 1.0, 450)})]
        backend = summarize_resources(samples)["backend"]
        self.assertEqual((3, {"accepted/ACCEPTED": 950}), (backend["dispatchCycles"], backend["deliveries"]))

    def test_missing_process_sample_is_skipped_not_counted_as_restart(self):
        samples = [process_sample(0, {"backend": (1, 0, 1.0, 0), "worker": (0, 0, 1.0, 100)}),
                   process_sample(5, {"backend": (2, 0, 1.0, 0)}),
                   process_sample(10, {"backend": (3, 0, 1.0, 0), "worker": (0, 0, 1.0, 120)})]
        backend = summarize_resources(samples)["backend"]
        self.assertEqual({"accepted/ACCEPTED": 20}, backend["deliveries"])

    def test_single_process_summary_has_no_process_breakdown(self):
        samples = [sample(0, 1.0, 1, 1, 0.0, 0.0, 0, 0.0, 1.0, 0), sample(5, 1.0, 1, 2, 0.0, 0.0, 0, 0.0, 1.0, 10)]
        self.assertNotIn("processes", summarize_resources(samples)["backend"])

    def test_reports_relay_and_queue_metrics_when_present(self):
        def queued(at, enqueued, failed, wait_count, wait_sum, processed, skipped):
            base = process_sample(at, {"backend": (at, 0, 1.0, 0), "worker": (0, 0, 1.0, processed)})
            base["metrics"] += [["career_form_push_relay_enqueued_total", {"source": "backend", "result": "queued"}, enqueued],
                                ["career_form_push_relay_enqueued_total", {"source": "backend", "result": "failed"}, failed],
                                ["career_form_push_relay_delay_seconds_count", {"source": "backend"}, enqueued],
                                ["career_form_push_relay_delay_seconds_sum", {"source": "backend"}, enqueued * 2.0],
                                ["career_form_push_relay_delay_seconds_max", {"source": "backend"}, 3.0 if enqueued else 0.0],
                                ["career_form_push_queue_wait_seconds_count", {"source": "worker"}, wait_count],
                                ["career_form_push_queue_wait_seconds_sum", {"source": "worker"}, wait_sum],
                                ["career_form_push_queue_wait_seconds_max", {"source": "worker"}, 4.0 if wait_count else 0.0],
                                ["career_form_push_worker_messages_total", {"source": "worker", "result": "processed"}, processed],
                                ["career_form_push_worker_messages_total", {"source": "worker", "result": "skipped"}, skipped]]
            return base

        queue = summarize_resources([queued(0, 0, 0, 0, 0.0, 0, 0), queued(5, 1000, 2, 1000, 1500.0, 1000, 3)])["backend"]["queue"]
        self.assertEqual({"queued": 1000, "failed": 2}, queue["enqueued"])
        self.assertEqual((2.0, 3.0), (queue["relayDelaySecondsAvg"], queue["relayDelaySecondsMax"]))
        self.assertEqual((1.5, 4.0), (queue["queueWaitSecondsAvg"], queue["queueWaitSecondsMax"]))
        self.assertEqual({"processed": 1000, "skipped": 3}, queue["workerMessages"])

    def test_direct_run_has_no_queue_section(self):
        samples = [sample(0, 1.0, 1, 1, 0.0, 0.0, 0, 0.0, 1.0, 0), sample(5, 1.0, 1, 2, 0.0, 0.0, 0, 0.0, 1.0, 10)]
        self.assertIsNone(summarize_resources(samples)["backend"]["queue"])


class ResourceRowsTest(unittest.TestCase):
    """요약 표의 자원 행. 프로세스가 여럿이면 프로세스별로, SQS 방식이면 릴레이·큐 행을 더 보여 준다."""

    def rows(self, backend):
        from pushload.report import _resource_rows
        return dict(_resource_rows({"containers": {}, "backend": backend, "samples": 2, "errors": 0, "seconds": 5.0, "window": None}))

    def test_single_process_keeps_one_jvm_line_and_no_queue_rows(self):
        rows = self.rows({"dispatchCycles": 2, "dispatchCycleSecondsAvg": 1.0, "dispatchCycleSecondsMax": 2.0, "gcPauses": 3,
                          "gcPauseSecondsTotal": 0.05, "heapBytesMax": 80.0, "deliveries": {"accepted/ACCEPTED": 1000}, "queue": None})
        self.assertEqual("3 / 0.05", rows["GC 정지 횟수 / 합(초)"])
        self.assertEqual("80", rows["힙 최대(바이트)"])
        self.assertFalse(any("큐" in label for label in rows))

    def test_sqs_run_shows_processes_and_queue_rows(self):
        rows = self.rows({"dispatchCycles": 2, "dispatchCycleSecondsAvg": 0.5, "dispatchCycleSecondsMax": 0.5, "gcPauses": 5,
                          "gcPauseSecondsTotal": 0.05, "heapBytesMax": 90.0, "deliveries": {"accepted/ACCEPTED": 1000},
                          "processes": {"backend": {"gcPauses": 1, "gcPauseSecondsTotal": 0.01, "heapBytesMax": 60.0},
                                        "worker": {"gcPauses": 4, "gcPauseSecondsTotal": 0.04, "heapBytesMax": 90.0}},
                          "queue": {"enqueued": {"queued": 1000, "failed": 2}, "relayDelaySecondsAvg": 2.0, "relayDelaySecondsMax": 3.0,
                                    "queueWaitSecondsAvg": 1.5, "queueWaitSecondsMax": 4.0, "workerMessages": {"processed": 1000, "skipped": 3}}})
        self.assertEqual("1 / 0.01, 60", rows["backend GC 정지 횟수 / 합(초), 힙 최대(바이트)"])
        self.assertEqual("4 / 0.04, 90", rows["worker GC 정지 횟수 / 합(초), 힙 최대(바이트)"])
        self.assertNotIn("힙 최대(바이트)", rows)
        self.assertEqual("queued 1000, failed 2", rows["릴레이가 큐에 넣은 결과"])
        self.assertEqual("2 / 3", rows["릴레이 지연 평균 / 최대(초)"])
        self.assertEqual("1.5 / 4", rows["큐 대기 평균 / 최대(초)"])
        self.assertEqual("processed 1000, skipped 3", rows["워커가 받은 메시지 결과"])


if __name__ == "__main__":
    unittest.main()
