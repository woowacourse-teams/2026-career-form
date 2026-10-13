import copy
import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path

CONTRACT_VERSION = "1.0"
LABEL_STATUSES = ("DRAFT", "CONFIRMED")
REVIEW_STATES = ("CONFIRMED", "NEEDS_REVIEW")
RECIPES = (
    "KOREAN_FULL_NAME",
    "ENGLISH_FULL_NAME_GIVEN_FIRST",
    "ENGLISH_FULL_NAME_FAMILY_FIRST",
    "BOOLEAN_YN",
    "YEAR_MONTH",
    "UNIVERSITY_ADDITIONAL_MAJOR_1_NAME",
    "UNIVERSITY_ADDITIONAL_MAJOR_1_CLASSIFICATION",
    "UNIVERSITY_ADDITIONAL_MAJOR_2_NAME",
    "UNIVERSITY_ADDITIONAL_MAJOR_2_CLASSIFICATION",
)
NO_MATCH = "NO_MATCH"
ERROR = "ERROR"
ABSTAIN = "ABSTAIN"
SITE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
RESULT_PATTERN = re.compile(r"^(NO_MATCH|ERROR|(DIRECT|DERIVED|LOOKUP|BUTTON_OPTION):\S+)$")
JEV_LINE = re.compile(
    r"\[requestId=(?P<request>[^\]]+)\].*\[JEV\] 분류 결과 question=(?P<question>\S+) "
    r"choice=(?P<choice>\S+) confidence=(?P<confidence>\S+) selected=\S+ "
    r"probabilities=\{(?P<probabilities>.*)\}"
)


class BenchmarkError(ValueError):
    pass


def deidentify_request(
    request: Mapping[str, object], site_id: str
) -> tuple[dict[str, object], dict[str, object]]:
    """Replaces location, snapshot, structural and DOM identifiers with stable aliases.

    Visible label, placeholder and option text stay because they are the mapping evidence.
    """
    if not SITE_ID_PATTERN.match(site_id):
        raise BenchmarkError("site_id는 소문자, 숫자, 하이픈만 사용할 수 있습니다")
    sections = request.get("sections")
    if not isinstance(sections, list) or not sections:
        raise BenchmarkError("요청에 sections가 없습니다")
    result = copy.deepcopy(dict(request))
    aliases: dict[str, dict[str, str]] = {
        "sections": {}, "items": {}, "groups": {}, "candidates": {}, "dom_ids": {}, "dom_names": {},
        "options": {},
    }

    def alias(kind: str, prefix: str, width: int, value: object) -> str:
        table = aliases[kind]
        key = str(value)
        if key not in table:
            table[key] = f"{prefix}{len(table) + 1:0{width}d}"
        return table[key]

    def candidate(field: dict[str, object]) -> None:
        field["candidateId"] = alias("candidates", "c", 3, field.get("candidateId"))
        if "domId" in field:
            field["domId"] = alias("dom_ids", "d", 3, field["domId"])
        if "domName" in field:
            field["domName"] = alias("dom_names", "n", 3, field["domName"])
        for option in field.get("options") or []:
            if "optionId" in option:
                option["optionId"] = alias("options", "o", 3, option["optionId"])
        context = field.get("semanticContext")
        if isinstance(context, dict) and isinstance(context.get("repeat"), dict):
            context["repeat"]["groupId"] = alias("groups", "g", 2, context["repeat"]["groupId"])

    for section in result["sections"]:
        section["sectionId"] = alias("sections", "s", 2, section.get("sectionId"))
        if section.get("parentSectionId") is not None:
            section["parentSectionId"] = alias("sections", "s", 2, section["parentSectionId"])
        for field in section.get("fields") or []:
            candidate(field)
        for item in section.get("items") or []:
            item["itemId"] = alias("items", "i", 2, item.get("itemId"))
            if item.get("itemGroupId") is not None:
                item["itemGroupId"] = alias("groups", "g", 2, item["itemGroupId"])
            for field in item.get("fields") or []:
                candidate(field)
    result["site"] = {"host": f"{site_id}.benchmark.invalid", "pathPattern": "/apply"}
    result["snapshotId"] = f"benchmark-{site_id}-fields"
    return result, {"site_id": site_id, **aliases}


def candidates_in_order(request: Mapping[str, object]) -> list[Mapping[str, object]]:
    candidates: list[Mapping[str, object]] = []
    for section in _list(request.get("sections"), "sections"):
        candidates.extend(section.get("fields") or [])
        for item in section.get("items") or []:
            candidates.extend(item.get("fields") or [])
    return candidates


def parse_fields_response(response: Mapping[str, object], candidate_ids: Sequence[str]) -> dict[str, str]:
    warnings = response.get("warningCodes") or []
    if response.get("blockCode") or "LLM_UNAVAILABLE" in warnings or response.get("analysisStatus") == "BLOCKED":
        return {candidate_id: ERROR for candidate_id in candidate_ids}
    results = {candidate_id: NO_MATCH for candidate_id in candidate_ids}
    for field in response.get("fields") or []:
        if field.get("candidateId") in results and field.get("matchType") == "MATCH":
            results[field["candidateId"]] = _binding(field.get("valueBinding") or {})
    return results


def parse_jev_log(text: str, candidate_ids: Sequence[str], top_k: int) -> dict[str, dict[str, object]]:
    groups: dict[str, list[re.Match[str]]] = {}
    for line in text.splitlines():
        match = JEV_LINE.search(line)
        if match:
            groups.setdefault(match["request"], []).append(match)
    field_groups = [
        matches for matches in groups.values()
        if all(match["question"].startswith("field_") for match in matches)
    ]
    if len(field_groups) > 1:
        raise BenchmarkError("로그 구간에 fields 요청의 Jev 판단이 둘 이상 있습니다")
    answers: dict[str, dict[str, object]] = {}
    for match in field_groups[0] if field_groups else []:
        index = int(match["question"].removeprefix("field_"))
        if index >= len(candidate_ids):
            raise BenchmarkError("Jev 질문 번호가 요청 후보 수를 넘습니다")
        probabilities = _probabilities(match["probabilities"])
        ranked = sorted(probabilities.items(), key=lambda entry: (-entry[1], entry[0]))[:top_k]
        answers[candidate_ids[index]] = {
            "raw_choice": match["choice"],
            "confidence": float(match["confidence"]),
            "top_probabilities": dict(ranked),
        }
    return answers


def load_benchmark(labels_path: Path) -> tuple[Mapping[str, object], dict[str, Mapping[str, object]]]:
    labels = _read(labels_path)
    profile_keys = labels.get("profile_keys")
    if isinstance(profile_keys, str):
        labels = {**labels, "profile_keys": _read_list(labels_path.parent / profile_keys)}
    requests: dict[str, Mapping[str, object]] = {}
    for site in _list(labels.get("sites"), "sites"):
        request = site.get("request")
        if not isinstance(request, str):
            raise BenchmarkError("라벨 사이트에 request 경로가 없습니다")
        requests[str(site.get("site_id"))] = _read(labels_path.parent / request)
    return labels, requests


def evaluate_benchmark(
    labels: Mapping[str, object],
    requests: Mapping[str, Mapping[str, object]],
    results: Sequence[Mapping[str, object]],
    thresholds: Sequence[float],
) -> dict[str, object]:
    expected = _validate_labels(labels, requests)
    choices = frozenset(labels["profile_keys"]) | frozenset(RECIPES) | {ABSTAIN}
    providers: dict[str, object] = {}
    for run in results:
        provider = run.get("provider")
        if not isinstance(provider, str) or not provider or provider in providers:
            raise BenchmarkError("결과의 provider는 비어 있지 않은 고유 이름이어야 합니다")
        answers = _validate_results(run, expected, choices)
        providers[provider] = _provider_report(run, expected, answers, thresholds)
    reviews = [entry["review"] for site in labels["sites"] for entry in site["labels"]]
    return {
        "contract_version": CONTRACT_VERSION,
        "labels": {
            "status": labels["label_status"],
            "needs_review": reviews.count("NEEDS_REVIEW"),
            "total": len(reviews),
        },
        "providers": providers,
    }


def _validate_labels(
    labels: Mapping[str, object], requests: Mapping[str, Mapping[str, object]]
) -> dict[str, dict[str, str]]:
    if labels.get("contract_version") != CONTRACT_VERSION:
        raise BenchmarkError(f"라벨 contract_version은 {CONTRACT_VERSION}이어야 합니다")
    if labels.get("label_status") not in LABEL_STATUSES:
        raise BenchmarkError("label_status가 올바르지 않습니다")
    keys = frozenset(_list(labels.get("profile_keys"), "profile_keys"))
    expected: dict[str, dict[str, str]] = {}
    for site in _list(labels.get("sites"), "sites"):
        site_id = _mapping(site, "라벨 사이트").get("site_id")
        if site_id not in requests or site_id in expected:
            raise BenchmarkError(f"알 수 없거나 중복된 사이트입니다: {site_id}")
        candidate_ids = [str(c.get("candidateId")) for c in candidates_in_order(requests[site_id])]
        entries: dict[str, str] = {}
        for entry in _list(site.get("labels"), "labels"):
            candidate_id = _mapping(entry, f"{site_id} 라벨").get("candidate_id")
            if candidate_id not in candidate_ids or candidate_id in entries:
                raise BenchmarkError(f"{site_id}: 알 수 없거나 중복된 후보입니다: {candidate_id}")
            if entry.get("review") not in REVIEW_STATES:
                raise BenchmarkError(f"{site_id}/{candidate_id}: review 상태가 올바르지 않습니다")
            if labels["label_status"] == "CONFIRMED" and entry["review"] != "CONFIRMED":
                raise BenchmarkError(f"{site_id}/{candidate_id}: 확정 라벨에 검수 필요 후보가 남아 있습니다")
            entries[candidate_id] = _expected(entry.get("expected"), keys, f"{site_id}/{candidate_id}")
        missing = [candidate_id for candidate_id in candidate_ids if candidate_id not in entries]
        if missing:
            raise BenchmarkError(f"{site_id}: 라벨이 없는 후보가 있습니다: {', '.join(missing)}")
        expected[str(site_id)] = entries
    return expected


def _expected(value: object, keys: frozenset[str], where: str) -> str:
    if value == NO_MATCH:
        return NO_MATCH
    kind, _, target = str(value).partition(":")
    if kind == "DIRECT" and target in keys:
        return str(value)
    if kind == "DERIVED" and target.split(":")[0] in RECIPES:
        return str(value)
    raise BenchmarkError(f"{where}: 기대값이 올바르지 않습니다: {value}")


def _validate_results(
    run: Mapping[str, object], expected: Mapping[str, Mapping[str, str]], choices: frozenset[str]
) -> dict[str, dict[str, Mapping[str, object]]]:
    if run.get("contract_version") != CONTRACT_VERSION:
        raise BenchmarkError(f"결과 contract_version은 {CONTRACT_VERSION}이어야 합니다")
    answers: dict[str, dict[str, Mapping[str, object]]] = {}
    for site in _list(run.get("sites"), "sites"):
        site_id = _mapping(site, "결과 사이트").get("site_id")
        if site_id not in expected or site_id in answers:
            raise BenchmarkError(f"결과에 알 수 없거나 중복된 사이트가 있습니다: {site_id}")
        entries: dict[str, Mapping[str, object]] = {}
        for entry in _list(site.get("candidates"), "candidates"):
            candidate_id = _mapping(entry, f"{site_id} 결과 후보").get("candidate_id")
            if candidate_id not in expected[site_id] or candidate_id in entries:
                raise BenchmarkError(f"{site_id}: 결과에 알 수 없거나 중복된 후보가 있습니다: {candidate_id}")
            if not isinstance(entry.get("result"), str) or not RESULT_PATTERN.match(entry["result"]):
                raise BenchmarkError(f"{site_id}/{candidate_id}: 결과 형식이 올바르지 않습니다")
            if "jev" in entry:
                _validate_judgment(entry["jev"], choices, f"{site_id}/{candidate_id}")
            entries[str(candidate_id)] = entry
        if set(entries) != set(expected[site_id]):
            raise BenchmarkError(f"{site_id}: 결과가 모든 후보를 포함하지 않습니다")
        answers[str(site_id)] = entries
    if set(answers) != set(expected):
        raise BenchmarkError("결과가 모든 라벨 사이트를 포함하지 않습니다")
    return answers


def _provider_report(
    run: Mapping[str, object],
    expected: Mapping[str, Mapping[str, str]],
    answers: Mapping[str, Mapping[str, Mapping[str, object]]],
    thresholds: Sequence[float],
) -> dict[str, object]:
    def scored(predict) -> dict[str, object]:
        pairs = {
            site_id: [(expected[site_id][cid], predict(answers[site_id][cid])) for cid in expected[site_id]]
            for site_id in expected
        }
        return {
            "overall": _metrics([pair for site in pairs.values() for pair in site]),
            "sites": {site_id: _metrics(site) for site_id, site in sorted(pairs.items())},
        }

    report: dict[str, object] = {
        "model": run.get("model"),
        "collected_with": run.get("collected_with"),
        **scored(lambda entry: entry["result"]),
    }
    has_jev = any("jev" in entry for site in answers.values() for entry in site.values())
    if has_jev and thresholds:
        report["thresholds"] = {
            format(threshold, "g"): scored(lambda entry, t=threshold: _thresholded(entry, t))["overall"]
            for threshold in thresholds
        }
    return report


def _validate_judgment(judgment: object, choices: frozenset[str], where: str) -> None:
    if (
        not isinstance(judgment, Mapping)
        or judgment.get("raw_choice") not in choices
        or not _probability(judgment.get("confidence"))
        or not isinstance(judgment.get("top_probabilities"), Mapping)
        or not all(
            isinstance(key, str) and _probability(value)
            for key, value in judgment["top_probabilities"].items()
        )
    ):
        raise BenchmarkError(f"{where}: Jev 판단 형식이 올바르지 않습니다")


def _probability(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1


def _thresholded(entry: Mapping[str, object], threshold: float) -> str:
    judgment = entry.get("jev")
    if not isinstance(judgment, Mapping):
        return ERROR if entry["result"] == ERROR else NO_MATCH
    choice = judgment.get("raw_choice")
    if choice == ABSTAIN or float(judgment["confidence"]) < threshold:
        return NO_MATCH
    return f"DERIVED:{choice}" if choice in RECIPES else f"DIRECT:{choice}"


def _metrics(pairs: Sequence[tuple[str, str]]) -> dict[str, object]:
    candidates = len(pairs)
    positives = sum(expected != NO_MATCH for expected, _ in pairs)
    errors = sum(result == ERROR for _, result in pairs)
    predicted = sum(result not in (NO_MATCH, ERROR) for _, result in pairs)
    correct = sum(result not in (NO_MATCH, ERROR) and result == expected for expected, result in pairs)
    wrong = predicted - correct
    missed = sum(expected != NO_MATCH and result in (NO_MATCH, ERROR) for expected, result in pairs)
    return {
        "candidates": candidates,
        "positives": positives,
        "predicted": predicted,
        "correct": correct,
        "wrong": wrong,
        "missed": missed,
        "errors": errors,
        "precision": correct / predicted if predicted else None,
        "recall": correct / positives if positives else None,
        "wrong_rate": wrong / candidates if candidates else None,
        "no_match_rate": (candidates - predicted - errors) / candidates if candidates else None,
    }


def _binding(binding: Mapping[str, object]) -> str:
    kind = binding.get("type")
    if kind == "DERIVED":
        suffix = f":{binding['profileFieldKey']}" if binding.get("profileFieldKey") else ""
        return f"DERIVED:{binding.get('recipe')}{suffix}"
    return f"{kind}:{binding.get('profileFieldKey')}"


def _probabilities(text: str) -> dict[str, float]:
    values: dict[str, float] = {}
    for part in text.split(", "):
        key, separator, value = part.rpartition("=")
        if separator:
            values[key.strip()] = float(value)
    return values


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise BenchmarkError(f"{name}는 객체여야 합니다")
    return value


def _list(value: object, name: str) -> list:
    if not isinstance(value, list):
        raise BenchmarkError(f"{name}는 배열이어야 합니다")
    return value


def _read(path: Path) -> Mapping[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BenchmarkError(f"JSON을 읽을 수 없습니다: {path.name}: {error}") from error
    if not isinstance(value, Mapping):
        raise BenchmarkError(f"JSON 객체가 아닙니다: {path.name}")
    return value


def _read_list(path: Path) -> list:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BenchmarkError(f"JSON을 읽을 수 없습니다: {path.name}: {error}") from error
    return _list(value, path.name)
