package com.careerform.quality;

import java.util.List;
import java.util.function.Predicate;
import java.util.function.ToLongFunction;

public record QualityObservedStats(Metric mapping, Metric binding, Metric inputSuccess, Metric retention,
                                   Metric collectedRetention, long fieldUnobserved, long deduplicationUnknown) {
    public record Sample(String id, QualityDailyAggregate.Contribution value) { }

    public record Metric(long numerator, long denominator, Double rate, long sampleCount,
                         long excludedSamples, long excludedFields, String unavailableReason) { }

    public static QualityObservedStats from(List<Sample> sources) {
        var requests = sources.stream().filter(source -> source.value().requests() > 0).toList();
        var executions = sources.stream().filter(source -> source.value().executions() > 0).toList();
        return new QualityObservedStats(
            metric(requests, value -> true, value -> value.analysisCounts().mapped(), value -> value.analysisCounts().discovered(), value -> 0),
            metric(executions, value -> !value.deduplicationUnknown() && value.observedFields() > 0,
                value -> value.reportedCounts().bound(), value -> value.reportedCounts().mapped(),
                value -> Math.max(0, value.executionCounts().mapped() - value.reportedCounts().mapped())),
            metric(executions, value -> !value.deduplicationUnknown() && value.inputObserved() > 0,
                value -> value.reportedCounts().written(), QualityDailyAggregate.Contribution::inputObserved,
                QualityDailyAggregate.Contribution::inputUnobserved),
            metric(executions, value -> !value.deduplicationUnknown() && value.retentionObserved() > 0,
                value -> value.reportedCounts().retained(), QualityDailyAggregate.Contribution::retentionObserved,
                QualityDailyAggregate.Contribution::retentionUnobserved),
            metric(executions, QualityObservedStats::complete, value -> value.reportedCounts().retained(),
                value -> value.executionCounts().discovered(),
                value -> complete(value) ? 0 : value.executionCounts().discovered()),
            sum(executions, value -> value.executionCounts().discovered() - value.observedFields()),
            distinct(executions.stream().filter(source -> source.value().deduplicationUnknown()).toList()));
    }

    private static boolean complete(QualityDailyAggregate.Contribution value) {
        return !value.deduplicationUnknown() && value.executionCounts().discovered() == value.observedFields()
            && value.inputUnobserved() == 0 && value.retentionUnobserved() == 0;
    }

    private static Metric metric(List<Sample> sources, Predicate<QualityDailyAggregate.Contribution> eligible,
                                 ToLongFunction<QualityDailyAggregate.Contribution> numerator,
                                 ToLongFunction<QualityDailyAggregate.Contribution> denominator,
                                 ToLongFunction<QualityDailyAggregate.Contribution> excludedFields) {
        var included = sources.stream().filter(source -> eligible.test(source.value())).toList();
        var excluded = sources.stream().filter(source -> !eligible.test(source.value())).toList();
        var top = sum(included, numerator);
        var bottom = sum(included, denominator);
        return new Metric(top, bottom, bottom == 0 ? null : (double) top / bottom, distinct(included),
            distinct(excluded), sum(sources, excludedFields),
            included.isEmpty() ? "NO_VALID_SAMPLES" : bottom == 0 ? "ZERO_DENOMINATOR" : null);
    }

    private static long distinct(List<Sample> sources) {
        return sources.stream().map(Sample::id).distinct().count();
    }

    private static long sum(List<Sample> sources, ToLongFunction<QualityDailyAggregate.Contribution> choose) {
        return sources.stream().mapToLong(source -> choose.applyAsLong(source.value())).reduce(0, Math::addExact);
    }
}
