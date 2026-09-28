#!/usr/bin/env python3
import argparse
import json
import sys
import tempfile
from collections.abc import Mapping
from hashlib import sha256
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.cli import read_json
from harness.lib.generic_autofill_eval import evaluate_generic_autofill


RATE_METRICS = (
    "mapping_precision",
    "mapping_recall",
    "correct_input_rate",
    "execution_retention_rate",
    "miswrite_rate",
)
QUALITY_METRICS = (
    "mapping_precision",
    "mapping_recall",
    "correct_input_rate",
    "execution_retention_rate",
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ground-truth", required=True)
    parser.add_argument("--observations", required=True)
    parser.add_argument("--output")
    parser.add_argument("--compare-to")
    arguments = parser.parse_args()
    try:
        artifact = _evaluate(arguments.ground_truth, arguments.observations)
        if arguments.compare_to:
            comparison = _compare(artifact, read_json(arguments.compare_to))
            artifact = {**artifact, "comparison": comparison}
        rendered = json.dumps(
            artifact, ensure_ascii=False, indent=2, sort_keys=True
        ) + "\n"
        if arguments.output:
            _write_atomic(Path(arguments.output), rendered)
        print(rendered, end="")
    except (OSError, ValueError) as error:
        print(f"오류: {error}", file=sys.stderr)
        return 1
    return 0


def _evaluate(ground_truth_path: str, observations_path: str) -> dict[str, object]:
    ground_truth = read_json(ground_truth_path)
    observations = read_json(observations_path)
    result = evaluate_generic_autofill(ground_truth, observations)
    return {
        **result,
        "inputs": {
            "ground_truth_sha256": _digest(Path(ground_truth_path)),
            "observations_sha256": _digest(Path(observations_path)),
        },
    }


def _digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _write_atomic(path: Path, rendered: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as temporary:
        temporary.write(rendered)
        temporary_path = Path(temporary.name)
    temporary_path.replace(path)


def _compare(
    current: Mapping[str, object], previous: Mapping[str, object]
) -> dict[str, object]:
    if current.get("contract_version") != previous.get("contract_version"):
        raise ValueError("비교 artifact의 contract_version이 다릅니다")
    if current.get("profile_version") != previous.get("profile_version"):
        raise ValueError("비교 artifact의 profile_version이 다릅니다")
    current_sources = _sources(current)
    previous_sources = _sources(previous)
    if set(current_sources) != set(previous_sources):
        raise ValueError("비교 artifact의 source 집합이 다릅니다")
    comparisons: dict[str, object] = {}
    regressions: list[dict[str, object]] = []
    for source in sorted(current_sources):
        current_source = _source(current_sources[source], source)
        previous_source = _source(previous_sources[source], source)
        _validate_site_set(current_source, previous_source, source)
        comparison = _compare_source(current_source, previous_source)
        comparisons[source] = comparison
        regressions.extend(_regressions(source, comparison))
    return {"sources": comparisons, "regressions": regressions}


def _sources(artifact: Mapping[str, object]) -> Mapping[str, object]:
    value = artifact.get("sources")
    if not isinstance(value, Mapping):
        raise ValueError("비교 artifact에 sources 객체가 필요합니다")
    return value


def _source(value: object, source: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{source} source는 객체여야 합니다")
    return value


def _validate_site_set(
    current: Mapping[str, object], previous: Mapping[str, object], source: str
) -> None:
    current_sites = current.get("sites")
    previous_sites = previous.get("sites")
    if not isinstance(current_sites, Mapping) or not isinstance(previous_sites, Mapping):
        raise ValueError(f"{source} source에 sites 객체가 필요합니다")
    if set(current_sites) != set(previous_sites):
        raise ValueError(f"{source} source의 site 집합이 다릅니다")


def _compare_source(
    current: Mapping[str, object], previous: Mapping[str, object]
) -> dict[str, object]:
    current_overall = _overall(current)
    previous_overall = _overall(previous)
    result = {
        metric: _compare_metric(current_overall, previous_overall, metric)
        for metric in RATE_METRICS
    }
    current_damage = _integer(current_overall, "existing_value_damage")
    previous_damage = _integer(previous_overall, "existing_value_damage")
    return {
        **result,
        "existing_value_damage_delta": current_damage - previous_damage,
    }


def _overall(source: Mapping[str, object]) -> Mapping[str, object]:
    value = source.get("overall")
    if not isinstance(value, Mapping):
        raise ValueError("source에 overall 객체가 필요합니다")
    return value


def _compare_metric(
    current: Mapping[str, object], previous: Mapping[str, object], name: str
) -> dict[str, object]:
    current_metric = _metric(current, name)
    previous_metric = _metric(previous, name)
    current_rate = _rate(current_metric, name)
    previous_rate = _rate(previous_metric, name)
    rate_delta = (
        current_rate - previous_rate
        if current_rate is not None and previous_rate is not None
        else None
    )
    return {
        "numerator_delta": _integer(current_metric, "numerator")
        - _integer(previous_metric, "numerator"),
        "denominator_delta": _integer(current_metric, "denominator")
        - _integer(previous_metric, "denominator"),
        "rate_delta": rate_delta,
    }


def _metric(overall: Mapping[str, object], name: str) -> Mapping[str, object]:
    value = overall.get(name)
    if not isinstance(value, Mapping):
        raise ValueError(f"overall에 {name} metric이 필요합니다")
    return value


def _integer(value: Mapping[str, object], name: str) -> int:
    result = value.get(name)
    if type(result) is not int:
        raise ValueError(f"{name}은 정수여야 합니다")
    return result


def _rate(value: Mapping[str, object], name: str) -> float | None:
    result = value.get("rate")
    if result is None:
        return None
    if type(result) not in (int, float):
        raise ValueError(f"{name} rate는 숫자 또는 null이어야 합니다")
    return float(result)


def _regressions(
    source: str, comparison: Mapping[str, object]
) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    damage_delta = comparison.get("existing_value_damage_delta")
    if type(damage_delta) is int and damage_delta > 0:
        result.append(
            {
                "source": source,
                "metric": "existing_value_damage",
                "delta": damage_delta,
            }
        )
    miswrite = comparison.get("miswrite_rate")
    if isinstance(miswrite, Mapping):
        _append_rate_regression(result, source, "miswrite_rate", miswrite, True)
    for name in QUALITY_METRICS:
        metric = comparison.get(name)
        if isinstance(metric, Mapping):
            _append_rate_regression(result, source, name, metric, False)
    return result


def _append_rate_regression(
    result: list[dict[str, object]],
    source: str,
    name: str,
    metric: Mapping[str, object],
    increase_is_harmful: bool,
) -> None:
    delta = metric.get("rate_delta")
    if type(delta) not in (int, float):
        return
    harmful = delta > 0 if increase_is_harmful else delta < 0
    if harmful:
        result.append({"source": source, "metric": name, "delta": delta})


if __name__ == "__main__":
    raise SystemExit(main())
