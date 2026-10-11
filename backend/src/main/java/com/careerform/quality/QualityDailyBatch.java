package com.careerform.quality;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public final class QualityDailyBatch {
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private final QualityStore store;
    private final QualityRegistry registry;
    private final Clock clock;
    private final String environment;
    private final String managementUrl;
    private final boolean configured;
    private final QualityDiscord.Sender sender;
    private final int recentDays;
    private final long minSample;

    public QualityDailyBatch(QualityStore store, QualityRegistry registry, Clock clock, String environment, String managementUrl,
                             boolean configured, QualityDiscord.Sender sender, int recentDays, long minSample) {
        if (recentDays < 1 || recentDays > 90 || minSample < 1) { throw new IllegalArgumentException("Invalid selection window"); }
        if (configured && (managementUrl == null || !managementUrl.matches("https?://[A-Za-z0-9.-]+(?::[0-9]+)?/quality/")
            || managementUrl.length() > 300)) { throw new IllegalArgumentException("Invalid management URL"); }
        this.store = store; this.registry = registry; this.clock = clock; this.environment = environment;
        this.managementUrl = managementUrl; this.configured = configured; this.sender = sender;
        this.recentDays = recentDays; this.minSample = minSample;
    }

    public record Entry(String candidateId, String host, String reason, boolean existing) { }
    public record Batch(String dateKst, List<Entry> entries, QualitySelection.Route nextRoute, long deferred,
                        QualityDiscord.Status status, String messageId, Instant updatedAt) {
        public Batch { entries = List.copyOf(entries); }
        Batch withStatus(QualityDiscord.Status next, String message, Instant at) {
            return new Batch(dateKst, entries, nextRoute, deferred, next, message, at);
        }
    }

    public Batch dispatch() {
        var now = clock.instant();
        if (!QualitySelection.isNotificationTime(now)) { return null; }
        var date = now.atZone(ZONE).toLocalDate().toString();
        var id = "batch_" + QualityProjection.digest(environment + "|" + date);
        var record = store.find(id, now).orElse(null);
        if (record == null) {
            var batch = select(date, now);
            var proposed = new QualityRecord(id, QualityRecord.Kind.BATCH, new QualityRecord.Group(environment, "ALL", "ALL", "ALL", "quality-v1"),
                0, now, null, batch);
            if (!store.insert(proposed)) { return dispatch(); }
            record = proposed;
        }
        var batch = (Batch) record.payload();
        if (batch.status() == QualityDiscord.Status.SENDING) {
            if (!now.isBefore(batch.updatedAt().plusSeconds(120))) {
                var unknown = record.withPayload(batch.withStatus(QualityDiscord.Status.UNKNOWN, null, now));
                if (store.replace(record, unknown)) { return (Batch) unknown.payload(); }
            }
            return batch;
        }
        if (!configured || batch.status() == QualityDiscord.Status.SENT || batch.status() == QualityDiscord.Status.UNKNOWN
            || batch.status() == QualityDiscord.Status.REJECTED) { return batch; }
        var sending = record.withPayload(batch.withStatus(QualityDiscord.Status.SENDING, null, now));
        if (!store.replace(record, sending)) { return (Batch) store.find(id, now).orElseThrow().payload(); }
        try {
            for (var entry : batch.entries()) { registry.request(entry.candidateId()); }
            var result = sender.send(message(batch));
            var finished = sending.withPayload(batch.withStatus(result.status(), result.messageId(), clock.instant()));
            return store.replace(sending, finished) ? (Batch) finished.payload() : (Batch) store.find(id, now).orElseThrow().payload();
        } catch (RuntimeException exception) {
            var unknown = sending.withPayload(batch.withStatus(QualityDiscord.Status.UNKNOWN, null, clock.instant()));
            store.replace(sending, unknown);
            return (Batch) unknown.payload();
        }
    }

    public Batch latest() {
        return list(QualityRecord.Kind.BATCH, null).stream().max(Comparator.comparing(QualityRecord::createdAt))
            .map(record -> (Batch) record.payload()).orElse(null);
    }

    private Batch select(String date, Instant now) {
        var candidates = registry.listRecords(null, 0, 10001);
        if (candidates.size() > 10000) { throw new IllegalArgumentException("Candidate selection needs a narrower window"); }
        var statistics = statistics(now);
        var options = candidates.stream().filter(record -> ((QualityRegistry.Candidate) record.payload()).statusAt(now) != QualityRegistry.Status.COMPLETED)
            .map(record -> option(record, statistics, now)).toList();
        var previous = latest();
        var selected = QualitySelection.select(now, options, previous == null ? QualitySelection.Route.STATIC : previous.nextRoute(), minSample);
        var byId = candidates.stream().collect(Collectors.toUnmodifiableMap(QualityRecord::id, record -> record));
        var entries = Stream.concat(selected.active().stream().map(candidate -> entry(candidate, byId, "기존 미완료", true)),
            selected.newRequests().stream().map(candidate -> entry(candidate, byId,
                selected.newRequests().indexOf(candidate) < 2 ? "장기 대기 및 경로 순환" : reason(candidate), false))).toList();
        var deferred = options.stream().filter(candidate -> !candidate.eligibleAt(now)).count();
        return new Batch(date, entries, selected.nextRoute(), deferred, configured ? QualityDiscord.Status.READY : QualityDiscord.Status.NOT_CONFIGURED, null, now);
    }

    private Entry entry(QualitySelection.Candidate candidate, Map<String, QualityRecord> records, String reason, boolean existing) {
        return new Entry(candidate.id(), records.get(candidate.id()).group().host(), reason, existing);
    }

    private String reason(QualitySelection.Candidate candidate) {
        if (candidate.counts().attempted() >= minSample && candidate.counts().written() < candidate.counts().attempted()) { return "입력 성공률 개선"; }
        if (candidate.counts().discovered() >= minSample && candidate.counts().mapped() < candidate.counts().discovered()) { return "매핑률 개선"; }
        return "최근 사용량";
    }

    private QualitySelection.Candidate option(QualityRecord record, Map<String, QualityDailyAggregate> statistics, Instant now) {
        var candidate = (QualityRegistry.Candidate) record.payload();
        var aggregate = statistics.getOrDefault(scope(record.group()), QualityDailyAggregate.empty());
        var counts = aggregate.uniqueCounts();
        var observed = aggregate.executionCounts();
        var attempts = aggregate.contributions().values().stream().filter(value -> value.inputUnobserved() == 0).mapToLong(value -> value.reportedCounts().attempted()).sum();
        var written = aggregate.contributions().values().stream().filter(value -> value.inputUnobserved() == 0).mapToLong(value -> value.reportedCounts().written()).sum();
        var ranking = new QualityMetrics.Counts(counts.discovered(), counts.mapped(), observed.bound(), attempts, written, 0);
        var route = Stream.of(QualitySelection.Route.values()).filter(value -> value.name().equals(record.group().route())).findFirst().orElse(QualitySelection.Route.GENERIC);
        return new QualitySelection.Candidate(candidate.id(), route, candidate.firstSeen(), candidate.statusAt(now) == QualityRegistry.Status.REQUESTED,
            candidate.claimedAt(now), candidate.statusAt(now) == QualityRegistry.Status.DEFERRED ? candidate.deferredUntil() : null, aggregate.executions(), ranking);
    }

    private Map<String, QualityDailyAggregate> statistics(Instant now) {
        var records = list(QualityRecord.Kind.AGGREGATE, now.atZone(ZONE).toLocalDate().minusDays(recentDays - 1L).atStartOfDay(ZONE).toInstant());
        return records.stream().collect(Collectors.toUnmodifiableMap(record -> scope(record.group()), record -> (QualityDailyAggregate) record.payload(), QualityDailyAggregate::plus));
    }

    private String scope(QualityRecord.Group group) { return group.site() + "|" + group.structure(); }

    private List<QualityRecord> list(QualityRecord.Kind kind, Instant from) {
        var records = store.list(new QualityStore.Query(kind, environment, null, null, null, from, null, 0, 10001), clock.instant());
        if (records.size() > 10000) { throw new IllegalArgumentException("Selection capacity exceeded"); }
        return records;
    }

    private String message(Batch batch) {
        var lines = batch.entries().stream().map(entry -> "• " + entry.host() + " — " + entry.reason() + "\n" + managementUrl + "?candidate=" + entry.candidateId()).toList();
        return batch.dateKst() + " 필드 수 확인\n" + (lines.isEmpty() ? "오늘 확인할 사이트가 없습니다." : String.join("\n", lines))
            + (batch.deferred() > 0 ? "\n보류 " + batch.deferred() + "개는 재확인일에 다시 선정합니다." : "") + "\n전체 미확인 목록: " + managementUrl;
    }
}
