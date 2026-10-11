package com.careerform.quality;

import java.time.Instant;
import java.util.Map;
import java.util.function.ToLongFunction;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public record QualityDailyAggregate(Map<String, Contribution> contributions) {
    private static final QualityMetrics.Counts ZERO = new QualityMetrics.Counts(0, 0, 0, 0, 0, 0);

    public QualityDailyAggregate { contributions = Map.copyOf(contributions); }

    public record Contribution(long revision, long requests, long executions, QualityMetrics.Counts analysisCounts,
                               QualityMetrics.Counts executionCounts, long observedFields, Instant unobservedAfter,
                               QualityExecution.Status status, Map<String, Long> reasons, QualityHistogram analysisTime,
                               QualityHistogram aiTime, long aiCalls, long aiFailures, long aiTimeouts,
                               Long reference, boolean matchingScope, QualityMetrics.Counts reportedCounts) {
        public Contribution {
            reasons = Map.copyOf(reasons);
            if (revision < 0 || requests < 0 || executions < 0 || observedFields < 0 || observedFields > executionCounts.discovered()
                || aiCalls < 0 || aiFailures < 0 || aiTimeouts < 0 || aiFailures > aiCalls || aiTimeouts > aiFailures) {
                throw new IllegalArgumentException("Invalid daily contribution");
            }
        }

        public Contribution(long revision, long requests, long executions, QualityMetrics.Counts analysisCounts,
                            QualityMetrics.Counts executionCounts, long observedFields, Instant unobservedAfter,
                            QualityExecution.Status status, Map<String, Long> reasons, QualityHistogram analysisTime,
                            QualityHistogram aiTime, long aiCalls, long aiFailures, long aiTimeouts, Long reference, boolean matchingScope) {
            this(revision, requests, executions, analysisCounts, executionCounts, observedFields, unobservedAfter, status,
                reasons, analysisTime, aiTime, aiCalls, aiFailures, aiTimeouts, reference, matchingScope, executionCounts);
        }

        public Contribution withReference(Long count, boolean matches) {
            return new Contribution(revision, requests, executions, analysisCounts, executionCounts, observedFields,
                unobservedAfter, status, reasons, analysisTime, aiTime, aiCalls, aiFailures, aiTimeouts, count, matches, reportedCounts);
        }

        public boolean pending(Instant now) { return executions > 0 && status == QualityExecution.Status.RUNNING && now.isBefore(unobservedAfter); }

        public boolean missing(Instant now) {
            return executions > 0 && !pending(now) && (status == QualityExecution.Status.RUNNING || observedFields < executionCounts.discovered()
                || inputUnobserved() > 0 || retentionUnobserved() > 0 || deduplicationUnknown());
        }

        public boolean deduplicationUnknown() { return reasons.containsKey("OBSERVATION|DEDUPLICATION_UNOBSERVED|ALL"); }

        public long inputObserved() { return reportedCounts.written() + reasonCount("EXECUTION_FAILED"); }
        public long inputUnobserved() { return Math.max(0, reportedCounts.attempted() - inputObserved()); }
        public long retentionObserved() { return reportedCounts.retained() + reasonCount("RETENTION_LOST"); }
        public long retentionUnobserved() { return Math.max(0, reportedCounts.written() - retentionObserved()); }

        private long reasonCount(String reason) {
            return reasons.entrySet().stream().filter(entry -> entry.getKey().contains("|" + reason + "|"))
                .mapToLong(Map.Entry::getValue).reduce(0, Math::addExact);
        }

        public QualityMetrics.CoverageStatus referenceStatus() {
            return executionCounts.coverage(reference, matchingScope).status();
        }

        public boolean missingInputCoverage() { return observedFields < executionCounts.discovered() || inputUnobserved() > 0; }
        public boolean missingRetentionCoverage() { return missingInputCoverage() || retentionUnobserved() > 0; }
    }

    public static QualityDailyAggregate empty() { return new QualityDailyAggregate(Map.of()); }

    public QualityDailyAggregate replace(String key, Contribution contribution) {
        var previous = contributions.get(key);
        if (previous != null && previous.revision() >= contribution.revision()) { return this; }
        if (previous == null && contributions.size() >= 10000) { throw new IllegalArgumentException("Daily group capacity exceeded"); }
        return new QualityDailyAggregate(Stream.concat(contributions.entrySet().stream().filter(entry -> !entry.getKey().equals(key)),
            Stream.of(Map.entry(key, contribution))).collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue)));
    }

    public QualityDailyAggregate plus(QualityDailyAggregate other) {
        var combined = this;
        for (var entry : other.contributions.entrySet()) { combined = combined.replace(entry.getKey(), entry.getValue()); }
        return combined;
    }

    public long requests() { return sum(Contribution::requests); }
    public long executions() { return sum(Contribution::executions); }
    public long reportedExecutions() { return contributions.values().stream().filter(value -> value.executions() > 0
        && (value.observedFields() > 0 || value.status() == QualityExecution.Status.COMPLETED || value.status() == QualityExecution.Status.CANCELLED)).count(); }
    public long pending(Instant now) { return contributions.values().stream().filter(value -> value.pending(now)).count(); }
    public long missing(Instant now) { return contributions.values().stream().filter(value -> value.missing(now)).count(); }
    public long cancelled() { return contributions.values().stream().filter(value -> value.status() == QualityExecution.Status.CANCELLED).count(); }
    public long scopeMismatch() { return contributions.values().stream().filter(value -> value.executions() > 0 && value.referenceStatus() == QualityMetrics.CoverageStatus.SCOPE_MISMATCH).count(); }
    public long referenceExecutions() { return references().count(); }
    public long unregistered() { return contributions.values().stream().filter(value -> value.executions() > 0 && value.reference() == null).count(); }
    public long referenceDenominator() { return references().mapToLong(Contribution::reference).reduce(0, Math::addExact); }
    public QualityMetrics.Counts analysisCounts() { return contributions.values().stream().map(Contribution::analysisCounts).reduce(ZERO, QualityMetrics.Counts::plus); }
    public QualityMetrics.Counts executionCounts() { return contributions.values().stream().map(Contribution::reportedCounts).reduce(ZERO, QualityMetrics.Counts::plus); }
    public QualityMetrics.Counts uniqueCounts() { return contributions.values().stream().map(Contribution::executionCounts).reduce(ZERO, QualityMetrics.Counts::plus); }
    public QualityMetrics.Counts referenceCounts() { return references().map(Contribution::executionCounts).reduce(ZERO, QualityMetrics.Counts::plus); }
    public QualityHistogram analysisTime() { return contributions.values().stream().map(Contribution::analysisTime).reduce(QualityHistogram.empty(), QualityHistogram::plus); }
    public QualityHistogram aiTime() { return contributions.values().stream().map(Contribution::aiTime).reduce(QualityHistogram.empty(), QualityHistogram::plus); }
    public long aiCalls() { return sum(Contribution::aiCalls); }
    public long aiFailures() { return sum(Contribution::aiFailures); }
    public long aiTimeouts() { return sum(Contribution::aiTimeouts); }

    public Map<String, Long> reasons() {
        return contributions.values().stream().flatMap(value -> value.reasons().entrySet().stream())
            .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue, Math::addExact));
    }

    private Stream<Contribution> references() {
        return contributions.values().stream().filter(value -> value.executions() > 0 && value.referenceStatus() == QualityMetrics.CoverageStatus.REFERENCE);
    }

    private long sum(ToLongFunction<Contribution> value) { return contributions.values().stream().mapToLong(value).reduce(0, Math::addExact); }
}
