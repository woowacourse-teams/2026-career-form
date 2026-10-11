package com.careerform.quality;

import java.time.Clock;
import java.time.ZoneId;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public final class QualityRollup {
    private static final QualityMetrics.Counts ZERO = new QualityMetrics.Counts(0, 0, 0, 0, 0, 0);
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private final QualityStore store;
    private final QualityRegistry registry;
    private final Clock clock;

    public QualityRollup(QualityStore store, QualityRegistry registry, Clock clock) {
        this.store = store;
        this.registry = registry;
        this.clock = clock;
    }

    public void observe(QualityRecord record) {
        if (record.kind() == QualityRecord.Kind.REQUEST) {
            var request = (QualityCollectionService.RequestEvent) record.payload();
            var reasons = !request.routeState().equals("ADAPTER") && !request.routeState().equals("GENERIC") && !request.routeState().equals("UNKNOWN")
                ? Map.of("ANALYSIS|" + request.routeState() + "|ALL", 1L) : Map.<String, Long>of();
            var resultReason = request.resultState().equals("COMPLETE") || request.resultState().equals("UNKNOWN")
                ? Map.<String, Long>of() : Map.of("ANALYSIS|" + request.resultState() + "|ALL", 1L);
            var combined = Stream.of(reasons, resultReason, request.reasons()).flatMap(value -> value.entrySet().stream())
                .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue, Math::addExact));
            var contribution = new QualityDailyAggregate.Contribution(record.revision(), 1, 0, request.counts() == null ? ZERO : request.counts(),
                ZERO, 0, null, null, combined, QualityHistogram.sample(request.durationMs()),
                request.calls().stream().map(call -> QualityHistogram.sample(call.durationMs())).reduce(QualityHistogram.empty(), QualityHistogram::plus),
                request.calls().size(), request.calls().stream().filter(call -> !call.outcome().equals("success")).count(),
                request.calls().stream().filter(call -> call.outcome().equals("timeout")).count(), null, false);
            save(record, record.group(), contribution);
        } else if (record.kind() == QualityRecord.Kind.EXECUTION) {
            var run = (QualityCollectionService.Run) record.payload();
            var groups = Stream.concat(Stream.of(record.group()), run.snapshots().values().stream().map(QualityCollectionService.SnapshotLink::group))
                .collect(Collectors.toUnmodifiableSet());
            for (var group : groups) { save(record, group, execution(record, run, group)); }
        }
    }

    private QualityDailyAggregate.Contribution execution(QualityRecord record, QualityCollectionService.Run run, QualityRecord.Group group) {
        var matching = run.snapshots().values().stream().filter(link -> link.group().equals(group)).toList();
        var deduplicated = matching.size() <= 1 || matching.stream().allMatch(QualityCollectionService.SnapshotLink::identityVerified);
        var keys = matching.stream().flatMap(link -> link.aliases().values().stream()).collect(Collectors.toUnmodifiableSet());
        var fields = run.execution().fields().entrySet().stream().filter(entry -> keys.contains(entry.getKey()))
            .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
        var sliced = new QualityExecution(run.execution().startedAt(), run.execution().lastObservedAt(), fields,
            run.execution().events(), run.execution().terminal());
        var controls = matching.stream().flatMap(link -> link.controls().entrySet().stream())
            .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue, (first, second) -> first));
        var reasons = !deduplicated ? Map.of("OBSERVATION|DEDUPLICATION_UNOBSERVED|ALL", 1L) : fields.entrySet().stream().filter(entry -> entry.getValue().observed() && entry.getValue().progress().reason() != null)
            .collect(Collectors.toUnmodifiableMap(entry -> stage(entry.getValue().progress().reason()) + "|" + entry.getValue().progress().reason()
                + "|" + controls.getOrDefault(entry.getKey(), "UNKNOWN"), entry -> 1L, Long::sum));
        var belongs = !matching.isEmpty() || run.snapshots().isEmpty();
        return new QualityDailyAggregate.Contribution(record.revision(), 0, belongs ? 1 : 0, ZERO, deduplicated ? sliced.counts() : ZERO,
            deduplicated ? fields.values().stream().filter(QualityExecution.Field::observed).count() : 0, run.execution().lastObservedAt().plusSeconds(1800),
            belongs ? run.execution().terminal() == null ? QualityExecution.Status.RUNNING : run.execution().terminal() : null,
            reasons, QualityHistogram.empty(), QualityHistogram.empty(), 0, 0, 0,
            registry.reference(group, record.createdAt()).orElse(null), deduplicated && !run.scopeMismatch() && group.identity() != QualitySite.Status.UNVERIFIED,
            deduplicated ? sliced.reportedCounts() : ZERO);
    }

    private String stage(QualityExecution.Reason reason) {
        return switch (reason) {
            case NOT_MAPPED -> "MAPPING";
            case NOT_APPROVED -> "APPROVAL";
            case PROFILE_VALUE_MISSING, EXISTING_VALUE_PROTECTED, UNSUPPORTED_FORMAT -> "BINDING";
            case RETENTION_LOST, RETENTION_UNOBSERVED -> "RETENTION";
            case CANCELLED -> "END";
            default -> "WRITE";
        };
    }

    private void save(QualityRecord source, QualityRecord.Group group, QualityDailyAggregate.Contribution contribution) {
        var day = source.createdAt().atZone(ZONE).toLocalDate();
        var start = day.atStartOfDay(ZONE).toInstant();
        var id = "daily_" + QualityProjection.digest(day + "|" + group);
        var key = source.kind().name() + "_" + QualityProjection.digest(source.id());
        for (var attempt = 0; attempt < 5; attempt++) {
            var previous = store.find(id, clock.instant());
            if (previous.isEmpty()) {
                var bucket = QualityDailyAggregate.empty().replace(key, contribution);
                if (store.insert(new QualityRecord(id, QualityRecord.Kind.AGGREGATE, group, 0, start,
                    day.plusDays(90).atStartOfDay(ZONE).toInstant(), bucket))) { return; }
            } else {
                var current = previous.orElseThrow();
                var bucket = ((QualityDailyAggregate) current.payload()).replace(key, contribution);
                if (bucket == current.payload() || store.replace(current, current.withPayload(bucket))) { return; }
            }
        }
        throw new IllegalStateException("Quality aggregate changed");
    }
}
