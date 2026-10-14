package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class QualityObservedStatsTest {
    private final Instant now = Instant.parse("2030-01-01T00:00:00Z");
    private final QualityStore store = mock(QualityStore.class);
    private final QualityStats stats = new QualityStats(store, Clock.fixed(now, ZoneOffset.UTC), "test");

    @Test
    void preservesObservedRatiosWhenUnreportedExecutionsAreMixedIn() {
        var complete = contribution(new QualityMetrics.Counts(10, 8, 8, 8, 6, 5), 10,
            Map.of("WRITE|EXECUTION_FAILED|TEXT", 2L, "RETENTION|RETENTION_LOST|TEXT", 1L));
        var missing = contribution(new QualityMetrics.Counts(20, 20, 0, 0, 0, 0), 0, Map.of());
        var row = query(Map.of("complete", complete, "missing", missing));
        assertThat(row.bindingRate()).isNull();
        assertThat(row.observed().binding().rate()).isEqualTo(1.0);
        assertThat(row.observed().binding().numerator()).isEqualTo(8);
        assertThat(row.observed().binding().denominator()).isEqualTo(8);
        assertThat(row.observed().binding().sampleCount()).isEqualTo(1);
        assertThat(row.observed().binding().excludedSamples()).isEqualTo(1);
        assertThat(row.observed().fieldUnobserved()).isEqualTo(20);
        assertThat(row.observed().inputSuccess().rate()).isEqualTo(0.75);
        assertThat(row.observed().retention().rate()).isEqualTo(5.0 / 6);
        assertThat(row.observed().collectedRetention().rate()).isEqualTo(0.5);
        assertThat(row.observed().collectedRetention().denominator()).isEqualTo(10);
    }

    @Test
    void usesEachStageObservedFieldsRatherThanDiscardingPartialExecutions() {
        var partial = contribution(new QualityMetrics.Counts(10, 8, 6, 6, 4, 2), 8,
            Map.of("WRITE|EXECUTION_FAILED|TEXT", 1L, "RETENTION|RETENTION_LOST|TEXT", 1L));
        var row = query(Map.of("partial", partial));
        assertThat(row.observed().inputSuccess().numerator()).isEqualTo(4);
        assertThat(row.observed().inputSuccess().denominator()).isEqualTo(5);
        assertThat(row.observed().inputSuccess().excludedFields()).isEqualTo(1);
        assertThat(row.observed().retention().rate()).isEqualTo(2.0 / 3);
        assertThat(row.observed().retention().excludedFields()).isEqualTo(1);
        assertThat(row.observed().collectedRetention().rate()).isNull();
        assertThat(row.observed().collectedRetention().excludedFields()).isEqualTo(10);
        assertThat(row.observed().collectedRetention().unavailableReason()).isEqualTo("NO_VALID_SAMPLES");
    }

    @Test
    void weightsByFieldCountsAndDoesNotInventZeroForMissingDenominators() {
        var first = contribution(new QualityMetrics.Counts(2, 2, 2, 2, 2, 2), 2, Map.of());
        var second = contribution(new QualityMetrics.Counts(18, 18, 18, 18, 0, 0), 18,
            Map.of("WRITE|EXECUTION_FAILED|TEXT", 18L));
        var row = query(Map.of("first", first, "second", second));
        assertThat(row.observed().inputSuccess().rate()).isEqualTo(0.1);
        assertThat(row.observed().collectedRetention().rate()).isEqualTo(0.1);
        var zero = query(Map.of("zero", contribution(new QualityMetrics.Counts(0, 0, 0, 0, 0, 0), 0, Map.of())));
        assertThat(zero.observed().inputSuccess().rate()).isNull();
        assertThat(zero.observed().binding().rate()).isNull();
    }

    @Test
    void bindingUsesOnlyTheReportedMappingCohort() {
        var source = new QualityDailyAggregate.Contribution(1, 0, 1, new QualityMetrics.Counts(0, 0, 0, 0, 0, 0),
            new QualityMetrics.Counts(10, 8, 1, 1, 1, 0), 3, now.minusSeconds(1), QualityExecution.Status.COMPLETED,
            Map.of(), QualityHistogram.empty(), QualityHistogram.empty(), 0, 0, 0, null, false,
            new QualityMetrics.Counts(3, 2, 1, 1, 1, 0));
        var row = query(Map.of("partial", source));
        assertThat(row.observed().binding().rate()).isEqualTo(0.5);
        assertThat(row.observed().binding().denominator()).isEqualTo(2);
        assertThat(row.observed().binding().excludedFields()).isEqualTo(6);
        assertThat(row.observed().fieldUnobserved()).isEqualTo(7);
    }

    @Test
    void excludesUnverifiedCorrespondenceFromCollectedRetention() {
        var complete = contribution(new QualityMetrics.Counts(2, 2, 2, 2, 2, 2), 2, Map.of());
        var unknown = contribution(new QualityMetrics.Counts(0, 0, 0, 0, 0, 0), 0,
            Map.of("OBSERVATION|DEDUPLICATION_UNOBSERVED|ALL", 1L));
        var row = query(Map.of("complete", complete, "unknown", unknown));
        assertThat(row.collectedRetentionRate()).isNull();
        assertThat(row.observed().collectedRetention().rate()).isEqualTo(1.0);
        assertThat(row.observed().collectedRetention().excludedSamples()).isEqualTo(1);
        assertThat(row.observed().deduplicationUnknown()).isEqualTo(1);
    }

    private QualityStatsResponse.Row query(Map<String, QualityDailyAggregate.Contribution> contributions) {
        var record = new QualityRecord("daily", QualityRecord.Kind.AGGREGATE,
            new QualityRecord.Group("test", "site.test", "shape", "GENERIC", "v1"), 0,
            now.minusSeconds(3600), now.plusSeconds(86400), new QualityDailyAggregate(contributions));
        when(store.list(any(), any())).thenReturn(List.of(record));
        return stats.query(null, null, null, null, null, null, "ROUTE").rows().getFirst();
    }

    private QualityDailyAggregate.Contribution contribution(QualityMetrics.Counts counts, long observed, Map<String, Long> reasons) {
        return new QualityDailyAggregate.Contribution(1, 0, 1, new QualityMetrics.Counts(0, 0, 0, 0, 0, 0), counts,
            observed, now.minusSeconds(1), QualityExecution.Status.COMPLETED, reasons,
            QualityHistogram.empty(), QualityHistogram.empty(), 0, 0, 0, null, false);
    }
}
