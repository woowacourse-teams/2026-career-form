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
        self.assertEqual(["docker: CalledProcessError", "metrics: OSError"], sample["errors"])


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


if __name__ == "__main__":
    unittest.main()
