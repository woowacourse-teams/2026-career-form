package com.careerform.quality;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.ToLongFunction;
import java.util.stream.Collectors;

public final class QualityStats {
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final QualityMetrics.Counts ZERO = new QualityMetrics.Counts(0, 0, 0, 0, 0, 0);
    private final QualityStore store;
    private final Clock clock;
    private final String environment;

    public QualityStats(QualityStore store, Clock clock, String environment) {
        this.store = store;
        this.clock = clock;
        this.environment = environment;
    }

    private record Source(String id, QualityDailyAggregate.Contribution value) {
    }

    public QualityStatsResponse query(Instant from, Instant to, String site, String structure, String route, String version, String groupBy) {
        var now = clock.instant();
        var start = from == null ? now.atZone(ZONE).toLocalDate().minusDays(6).atStartOfDay(ZONE).toInstant() : from;
        var end = to == null ? now.atZone(ZONE).toLocalDate().plusDays(1).atStartOfDay(ZONE).toInstant() : to;
        QualityRetention.checkRange(start, end, true);
        var firstDay = start.atZone(ZONE).toLocalDate().atStartOfDay(ZONE).toInstant();
        var boundary = end.atZone(ZONE).toLocalDate().atStartOfDay(ZONE).toInstant();
        var lastDay = end.equals(boundary) ? end : end.atZone(ZONE).toLocalDate().plusDays(1).atStartOfDay(ZONE).toInstant();
        var records = store.list(new QualityStore.Query(QualityRecord.Kind.AGGREGATE, environment,
            clean(site), clean(route), clean(version), firstDay, lastDay, 0, 10001), now);
        if (records.size() > 10000) { throw narrow(); }
        var groups = records.stream().filter(record -> clean(structure) == null || record.group().structure().equals(structure))
            .filter(record -> ((QualityDailyAggregate) record.payload()).requests() > 0 || ((QualityDailyAggregate) record.payload()).executions() > 0)
            .collect(Collectors.groupingBy(record -> dimension(record, groupBy)));
        if (groups.size() > 500) { throw narrow(); }
        var rows = groups.entrySet().stream().sorted(Comparator.comparing(entry -> entry.getKey().toString()))
            .map(entry -> row(entry.getKey(), entry.getValue(), now)).toList();
        var failures = rows.stream().flatMap(row -> row.reasons().entrySet().stream().map(entry -> {
            var parts = entry.getKey().split("\\|", 4);
            return new QualityStatsResponse.Failure(row.dimension(), parts[0], parts[1], parts[2], parts[3], entry.getValue());
        })).toList();
        return new QualityStatsResponse(firstDay, lastDay, rows, failures);
    }

    private QualityStatsResponse.Dimension dimension(QualityRecord record, String groupBy) {
        var group = record.group();
        return switch (groupBy) {
            case "FULL" -> new QualityStatsResponse.Dimension(environment, group.site(), group.host(), group.identity().name(), group.structure(), group.route(), group.version(), "ALL");
            case "ROUTE" -> new QualityStatsResponse.Dimension(environment, "ALL", "ALL", "COMPOSITION_VARIES", "ALL", group.route(), "ALL", "ALL");
            case "VERSION_TREND" -> new QualityStatsResponse.Dimension(environment, "ALL", "ALL", "COMPOSITION_VARIES", "ALL", group.route(), group.version(), record.createdAt().atZone(ZONE).toLocalDate().toString());
            case "SITE_ROUTE_VERSION" -> new QualityStatsResponse.Dimension(environment, group.site(), group.host(), group.identity().name(), "ALL", group.route(), group.version(), "ALL");
            default -> throw new IllegalArgumentException("Invalid grouping");
        };
    }

    private QualityStatsResponse.Row row(QualityStatsResponse.Dimension dimension, List<QualityRecord> records, Instant now) {
        var sources = records.stream().flatMap(record -> ((QualityDailyAggregate) record.payload()).contributions().entrySet().stream()
            .map(entry -> new Source(entry.getKey(), entry.getValue()))).toList();
        var analysis = counts(sources, QualityDailyAggregate.Contribution::analysisCounts);
        var unique = counts(sources, QualityDailyAggregate.Contribution::executionCounts);
        var reported = counts(sources, QualityDailyAggregate.Contribution::reportedCounts);
        var references = sources.stream().filter(source -> source.value().executions() > 0
            && source.value().referenceStatus() == QualityMetrics.CoverageStatus.REFERENCE).toList();
        var humanCounts = counts(references, QualityDailyAggregate.Contribution::executionCounts);
        var denominator = sum(references, value -> value.reference());
        var human = humanCounts.coverage(denominator, true);
        var inputCoverageMissing = references.stream().anyMatch(source -> source.value().missingInputCoverage());
        var retentionCoverageMissing = references.stream().anyMatch(source -> source.value().missingRetentionCoverage());
        var ratios = reported.ratios();
        var analysisTime = sources.stream().map(source -> source.value().analysisTime()).reduce(QualityHistogram.empty(), QualityHistogram::plus);
        var aiTime = sources.stream().map(source -> source.value().aiTime()).reduce(QualityHistogram.empty(), QualityHistogram::plus);
        var executions = distinct(sources, value -> value.executions() > 0);
        var observed = distinct(sources, value -> value.executions() > 0 && (value.observedFields() > 0
            || value.status() == QualityExecution.Status.COMPLETED || value.status() == QualityExecution.Status.CANCELLED));
        var reasons = sources.stream().flatMap(source -> source.value().reasons().entrySet().stream()
            .map(entry -> Map.entry((source.value().requests() > 0 ? "REQUEST|" : "EXECUTION|") + entry.getKey(), entry.getValue())))
            .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue, Math::addExact));
        var calls = sum(sources, QualityDailyAggregate.Contribution::aiCalls);
        var failures = sum(sources, QualityDailyAggregate.Contribution::aiFailures);
        var timeouts = sum(sources, QualityDailyAggregate.Contribution::aiTimeouts);
        var inputObserved = sum(sources, QualityDailyAggregate.Contribution::inputObserved);
        var retentionObserved = sum(sources, QualityDailyAggregate.Contribution::retentionObserved);
        var correspondenceMissing = distinct(sources, QualityDailyAggregate.Contribution::deduplicationUnknown);
        var fieldsMissing = sources.stream().anyMatch(source -> source.value().executions() > 0
            && source.value().observedFields() < source.value().executionCounts().discovered());
        return new QualityStatsResponse.Row(dimension, sum(sources, QualityDailyAggregate.Contribution::requests), executions, observed, ratio(observed, executions),
            distinct(sources, value -> value.pending(now)), distinct(sources, value -> value.missing(now)),
            distinct(sources, value -> value.status() == QualityExecution.Status.CANCELLED), correspondenceMissing, analysis.discovered(), analysis.mapped(), analysis.ratios().mapping(),
            unique.discovered(), unique.mapped(), reported.discovered(), reported.mapped(), reported.bound(), reported.attempted(), reported.written(), reported.retained(),
            inputObserved, sum(sources, QualityDailyAggregate.Contribution::inputUnobserved), retentionObserved, sum(sources, QualityDailyAggregate.Contribution::retentionUnobserved),
            correspondenceMissing == 0 && !fieldsMissing ? ratios.binding() : null, correspondenceMissing == 0 && !fieldsMissing && reported.attempted() == inputObserved ? ratios.inputSuccess() : null,
            correspondenceMissing == 0 && !fieldsMissing && reported.written() == retentionObserved ? ratios.retention() : null,
            correspondenceMissing == 0 && !fieldsMissing && reported.attempted() == inputObserved && reported.written() == retentionObserved ? ratios.collectedRetention() : null,
            ratio(reported.written(), inputObserved), ratio(reported.retained(), retentionObserved), denominator, distinct(references, value -> true),
            distinct(sources, value -> value.executions() > 0 && value.reference() == null),
            distinct(sources, value -> value.executions() > 0 && value.referenceStatus() == QualityMetrics.CoverageStatus.SCOPE_MISMATCH),
            human.discovered(), human.mapped(), inputCoverageMissing ? null : human.written(), retentionCoverageMissing ? null : human.retained(),
            "사람 확인 분모, 정확도 미검증", "클라이언트 보고, 입력 후 1초 확인",
            calls, failures, timeouts, ratio(failures, calls), ratio(timeouts, calls), analysisTime.p95(), analysisTime.samples(), analysisTime.overflow(),
            aiTime.p95(), aiTime.samples(), aiTime.overflow(), reasons);
    }

    private QualityMetrics.Counts counts(List<Source> sources, Function<QualityDailyAggregate.Contribution, QualityMetrics.Counts> choose) {
        return sources.stream().map(source -> choose.apply(source.value())).reduce(ZERO, QualityMetrics.Counts::plus);
    }

    private long sum(List<Source> sources, ToLongFunction<QualityDailyAggregate.Contribution> choose) {
        return sources.stream().mapToLong(source -> choose.applyAsLong(source.value())).reduce(0, Math::addExact);
    }

    private long distinct(List<Source> sources, java.util.function.Predicate<QualityDailyAggregate.Contribution> choose) {
        return sources.stream().filter(source -> choose.test(source.value())).map(Source::id).distinct().count();
    }

    private Double ratio(long numerator, long denominator) { return denominator == 0 ? null : (double) numerator / denominator; }

    private String clean(String value) { return value == null || value.isBlank() || value.equals("ALL") ? null : value; }

    private IllegalArgumentException narrow() { return new IllegalArgumentException("Narrow quality filters"); }
}
