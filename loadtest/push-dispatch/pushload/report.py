"""실행 기록, 모의 서버 기록, 자원 기록, MongoDB를 합쳐 요약 문서(summary.json)와 Markdown 표를 만든다."""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping, Sequence

from pushload import mongo_report
from pushload.delivery import MAX_GAPS, MIN_GAP_SECONDS, decode_requests, delivery_metrics
from pushload.resources import summarize_resources
from pushload.runfiles import iso_epoch, parse_iso
from pushload.webpush import decrypt_aes128gcm


def build_summary(run: Mapping, subscribers: Mapping, records: Sequence[Mapping], samples: Sequence[Mapping], database,
                  skipped_records: int, now: dt.datetime) -> dict:
    postings = run["postings"]
    items = postings["items"]
    scheduled_at = {item["id"]: parse_iso(item["scheduledAt"]).timestamp() for item in items}
    requests, request_stats = decode_requests(records, subscribers, decrypt_aes128gcm)
    metrics = delivery_metrics(requests, scheduled_at)
    gone = metrics["goneSubscriptionIds"]
    delivery = {key: value for key, value in metrics.items() if key != "goneSubscriptionIds"}
    return {
        "runId": run.get("runId"),
        "generatedAt": iso_epoch(now.timestamp()),
        "repository": postings.get("repository"),
        "mock": postings.get("mock"),
        "notes": postings.get("notes", {}),
        "subscriptions": run.get("subscriptions"),
        "postings": {"count": len(items), "scheduledAt": items[0]["scheduledAt"], "expectedDeliveries": sum(item["deliveries"] for item in items),
                     "registration": postings.get("registration"), "warnings": postings.get("warnings", [])},
        "requests": request_stats,
        "skippedRecords": skipped_records,
        "delivery": {**delivery, "goneSubscriptions": len(gone)},
        "mongo": _mongo(database, list(scheduled_at), sum(item["deliveries"] for item in items), gone) if database is not None else None,
        "resources": {"sending": summarize_resources(samples, delivery["window"]) if delivery["window"] else None,
                      "wholeRun": summarize_resources(samples)},
    }


def _mongo(database, posting_ids: Sequence[str], expected: int, gone: Sequence[str]) -> dict:
    return {"deliveries": mongo_report.delivery_report(database, posting_ids, expected), "storage": mongo_report.storage_report(database),
            "remainingGoneSubscriptions": mongo_report.remaining_gone(database, gone)}


def render_table(summary: Mapping) -> str:
    rows = [("항목", "값"), ("---", "---")] + _run_rows(summary) + _delivery_rows(summary["delivery"]) + _mongo_rows(summary["mongo"]) \
        + _resource_rows(summary["resources"]["sending"] or summary["resources"]["wholeRun"]) + _input_rows(summary)
    return "\n".join(f"| {label} | {value} |" for label, value in rows)


def _run_rows(summary: Mapping) -> list[tuple[str, str]]:
    notes = ", ".join(f"{key}={value}" for key, value in summary["notes"].items()) or "-"
    subscriptions = (summary.get("subscriptions") or {}).get("count")
    postings = summary["postings"]
    return [("실행 id", _text(summary["runId"])), ("커밋", _commit(summary.get("repository"))), ("모의 서버 설정", _mock(summary.get("mock"))),
            ("메모", notes), ("구독 수", _text(subscriptions)), ("공고 수", _text(postings["count"])),
            ("예정 시각", postings["scheduledAt"]), ("등록 때 만든 발송 문서", _text(postings["expectedDeliveries"]))]


def _commit(repository: Mapping | None) -> str:
    if not repository or not repository.get("commit"):
        return "-"
    return repository["commit"][:12] + (" (커밋하지 않은 변경 있음)" if repository.get("dirty") else "")


def _mock(settings: Mapping | None) -> str:
    if not settings:
        return "-"
    return (f"지연 {_text(settings.get('delayMs'))}ms, 상태 {_text(settings.get('statuses'))}, "
            f"Retry-After {_text(settings.get('retryAfterSeconds'))}초, 시드 {_text(settings.get('seed'))}")


def _delivery_rows(delivery: Mapping) -> list[tuple[str, str]]:
    latency, burst, gap, retry = delivery["latencyMs"], delivery["burst"], delivery["longestAcceptanceGap"], delivery["retry"]
    window = delivery["window"]
    return [
        ("발송 구간(첫 요청→마지막 응답)", f"{iso_epoch(window['from'])} → {iso_epoch(window['to'])}" if window else "-"),
        ("모의 서버가 받은 요청", _text(delivery["requests"])),
        ("응답 상태별 요청", _counts(delivery["byStatus"])),
        ("수락", _text(delivery["accepted"])),
        ("중복 쌍 / 초과 건수", f"{delivery['duplicates']['pairs']} / {delivery['duplicates']['extra']}"),
        ("예정 시각→마지막 수락(초)", _text(burst["scheduledToLastAcceptedSeconds"])),
        ("첫 요청→마지막 수락(초)", _text(burst["firstRequestToLastAcceptedSeconds"])),
        ("전파 지연 p50 / p95 / p99(ms)", f"{_text(latency['p50'])} / {_text(latency['p95'])} / {_text(latency['p99'])}"),
        ("초당 수락 최댓값", _text(delivery["maxAcceptedPerSecond"])),
        ("최대 동시 요청", _text(delivery["maxConcurrency"])),
        ("수락이 끊긴 가장 긴 구간(초)", _text(gap["seconds"])),
        (f"수락이 끊긴 구간({MIN_GAP_SECONDS:g}초 이상 가운데 긴 것 최대 {MAX_GAPS}개, 시각 순)", _gap_list(delivery["acceptanceGaps"])),
        ("Retry-After 전 재요청", _text(retry["beforeRetryAfter"])),
        ("404·410 뒤 같은 구독 재요청", _text(retry["afterGone"])),
        ("400·403·413 뒤 같은 쌍 재요청", _text(retry["afterInvalid"])),
    ]


def _mongo_rows(mongo: Mapping | None) -> list[tuple[str, str]]:
    if mongo is None:
        return [("MongoDB", "읽지 않음(--without-mongo)")]
    deliveries, storage = mongo["deliveries"], mongo["storage"]
    per_posting = list(deliveries["perPosting"].values())
    return [
        ("발송 문서(찾음 / 등록 때)", f"{deliveries['found']} / {_text(deliveries['expected'])}"),
        ("유실(끝나지 않은 발송 문서)", _text(deliveries["lost"])),
        ("발송 문서 상태", _counts(deliveries["byStatus"])),
        ("상태/사유", _counts(deliveries["byStatusReason"])),
        ("시도 횟수 분포", _counts({f"{count}회": number for count, number in deliveries["attempts"].items()})),
        ("공고별 발송 문서(최소 / 최대)", f"{min(per_posting, default=0)} / {max(per_posting, default=0)}"),
        ("404·410을 받고도 남은 구독", _text(mongo["remainingGoneSubscriptions"])),
        ("push_deliveries 데이터 / 저장 / 인덱스(바이트)", f"{_text(storage['size'])} / {_text(storage['storageSize'])} / {_text(storage['totalIndexSize'])}"),
        ("공고 1건당 바이트(데이터+인덱스)", _text(storage["bytesPerPosting"])),
    ]


def _resource_rows(resources: Mapping) -> list[tuple[str, str]]:
    rows = [(f"{name} CPU 평균 / 최대(%), 메모리 최대(바이트)",
             f"{_text(item['cpuPercentAvg'])} / {_text(item['cpuPercentMax'])}, {_text(item['memBytesMax'])}")
            for name, item in resources["containers"].items()]
    backend = resources["backend"]
    if backend:
        rows += [("발송기 주기 수 / 평균 / 최대(초)", f"{backend['dispatchCycles']} / {_text(backend['dispatchCycleSecondsAvg'])} / {_text(backend['dispatchCycleSecondsMax'])}"),
                 ("GC 정지 횟수 / 합(초)", f"{backend['gcPauses']} / {_text(backend['gcPauseSecondsTotal'])}"),
                 ("힙 최대(바이트)", _text(backend["heapBytesMax"])), ("지표상 발송 결과 증가", _counts(backend["deliveries"]))]
    scope = "발송 구간" if resources.get("window") else "실행 전체"
    return rows + [(f"자원 기록 수 / 오류 / 기간(초) ({scope})", f"{resources['samples']} / {resources['errors']} / {_text(resources['seconds'])}")]


def _input_rows(summary: Mapping) -> list[tuple[str, str]]:
    stats = summary["requests"]
    return [("기록 줄 / 이번 실행 구독 / 복호화 실패 / 다른 경로 / 모양이 틀린 줄",
             f"{stats['records']} / {stats['matched']} / {stats['undecryptable']} / {stats['unknownPath']} / {stats['invalid']}"),
            ("건너뛴 기록(깨진 줄, 모양이 틀린 키·자원 기록)", _text(summary["skippedRecords"]))]


def _gap_list(gaps: Sequence[Mapping]) -> str:
    return ", ".join(f"{_text(gap['seconds'])}초({iso_epoch(gap['from'])}→{iso_epoch(gap['to'])})" for gap in gaps) or "-"


def _counts(values: Mapping) -> str:
    return ", ".join(f"{key} {_text(value)}" for key, value in values.items()) or "-"


def _text(value: object) -> str:
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:.0f}" if value.is_integer() and abs(value) >= 1000 else f"{value:g}"
    return str(value)
