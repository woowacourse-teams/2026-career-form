package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Grafana에 원본 실행 대신 제한된 품질 통계를 제공")
class QualityStatsTest {
    private final Instant now = Instant.parse("2030-01-01T00:00:00Z");
    private final QualityStore store = mock(QualityStore.class);
    private final QualityStats stats = new QualityStats(store, Clock.fixed(now, ZoneOffset.UTC), "test");

    @Test
    void returnsWeightedRatiosAndBothDenominators() {
        when(store.list(any(), any())).thenReturn(List.of(record(1, 10, 8), record(2, 90, 9)));
        var result = stats.query(null, null, null, null, null, null, "ROUTE");
        var row = result.rows().getFirst();
        assertThat(row.analysisRequests()).isEqualTo(2);
        assertThat(row.executionCount()).isEqualTo(2);
        assertThat(row.mappingRate()).isEqualTo(0.17);
        assertThat(row.collected()).isEqualTo(100);
        assertThat(row.mapped()).isEqualTo(17);
        assertThat(row.humanDenominator()).isEqualTo(200);
        assertThat(row.humanMappedCoverage()).isEqualTo(17.0 / 200);
        assertThat(row.humanLabel()).contains("정확도 미검증");
    }

    @Test
    void neverTruncatesMoreThanFiveHundredGroups() {
        when(store.list(any(), any())).thenReturn(IntStream.range(0, 501).mapToObj(index -> record(index, 1, 1)).toList());
        assertThatThrownBy(() -> stats.query(null, null, null, null, null, null, "FULL"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void validatesRangeAndReturnsEmptyWithoutInventingSuccess() {
        when(store.list(any(), any())).thenReturn(List.of());
        assertThat(stats.query(null, null, null, null, null, null, "ROUTE").rows()).isEmpty();
        assertThatThrownBy(() -> stats.query(now.minusSeconds(91 * 86400L), now, null, null, null, null, "FULL"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void excludesUnobservedInputAndRetentionFromRateDenominators() {
        var counts = new QualityMetrics.Counts(2, 2, 2, 2, 1, 0);
        var contribution = new QualityDailyAggregate.Contribution(1, 0, 1, counts, counts, 2, now.plusSeconds(1800),
            QualityExecution.Status.COMPLETED, Map.of("RETENTION|RETENTION_UNOBSERVED|TEXT", 1L), QualityHistogram.empty(),
            QualityHistogram.empty(), 0, 0, 0, null, false);
        var record = new QualityRecord("partial", QualityRecord.Kind.AGGREGATE,
            new QualityRecord.Group("test", "example.test", "shape", "GENERIC", "build"), 0,
            now.minusSeconds(3600), now.plusSeconds(90 * 86400L), new QualityDailyAggregate(Map.of("run", contribution)));
        when(store.list(any(), any())).thenReturn(List.of(record));
        var row = stats.query(null, null, null, null, null, null, "ROUTE").rows().getFirst();
        assertThat(row.inputResultObserved()).isEqualTo(1);
        assertThat(row.inputResultUnobserved()).isEqualTo(1);
        assertThat(row.inputSuccessRate()).isNull();
        assertThat(row.observedInputSuccessRate()).isEqualTo(1.0);
        assertThat(row.retentionObserved()).isZero();
        assertThat(row.retentionUnobserved()).isEqualTo(1);
        assertThat(row.retentionRate()).isNull();
        assertThat(row.collectedRetentionRate()).isNull();
        assertThat(row.unobserved()).isEqualTo(1);
    }

    @Test
    void keepsHumanMappingCoverageWhileInputResultsAreUnknown() {
        var counts = new QualityMetrics.Counts(2, 2, 2, 2, 1, 0);
        var contribution = new QualityDailyAggregate.Contribution(1, 0, 1, counts, counts, 2, now.plusSeconds(1800),
            QualityExecution.Status.COMPLETED, Map.of("RETENTION|RETENTION_UNOBSERVED|TEXT", 1L), QualityHistogram.empty(),
            QualityHistogram.empty(), 0, 0, 0, 10L, true);
        var record = new QualityRecord("human-partial", QualityRecord.Kind.AGGREGATE,
            new QualityRecord.Group("test", "example.test", "shape", "GENERIC", "build"), 0,
            now.minusSeconds(3600), now.plusSeconds(90 * 86400L), new QualityDailyAggregate(Map.of("run", contribution)));
        when(store.list(any(), any())).thenReturn(List.of(record));
        var row = stats.query(null, null, null, null, null, null, "ROUTE").rows().getFirst();
        assertThat(row.humanCollectedCoverage()).isEqualTo(0.2);
        assertThat(row.humanMappedCoverage()).isEqualTo(0.2);
        assertThat(row.humanWrittenCoverage()).isNull();
        assertThat(row.humanRetainedCoverage()).isNull();
    }

    private QualityRecord record(int id, long collected, long mapped) {
        var counts = new QualityMetrics.Counts(collected, mapped, mapped, mapped, mapped, mapped);
        var source = new QualityDailyAggregate.Contribution(0, 1, 1, counts, counts, collected,
            now.plusSeconds(1800), QualityExecution.Status.COMPLETED, Map.of(), QualityHistogram.sample(50),
            QualityHistogram.sample(80), 1, 0, 0, collected * 2, true);
        return new QualityRecord("daily_" + id, QualityRecord.Kind.AGGREGATE,
            new QualityRecord.Group("test", "example" + id + ".test", "shape", "GENERIC", "build"), 0,
            Instant.parse("2029-12-31T15:00:00Z"), now.plusSeconds(90 * 86400L), new QualityDailyAggregate(Map.of("source_" + id, source)));
    }

    @Test
    void keepsDeduplicationUnknownSeparateFromSuccessfulReportedRuns() {
        var zero = new QualityMetrics.Counts(0, 0, 0, 0, 0, 0);
        var source = new QualityDailyAggregate.Contribution(1, 0, 1, zero, zero, 0, now.minusSeconds(1),
            QualityExecution.Status.COMPLETED, Map.of("OBSERVATION|DEDUPLICATION_UNOBSERVED|ALL", 1L), QualityHistogram.empty(),
            QualityHistogram.empty(), 0, 0, 0, null, false);
        var unknown = new QualityRecord("unknown", QualityRecord.Kind.AGGREGATE, new QualityRecord.Group("test", "example.test", "shape", "GENERIC", "build"),
            0, now.minusSeconds(3600), now.plusSeconds(86400), new QualityDailyAggregate(Map.of("unknown", source)));
        when(store.list(any(), any())).thenReturn(List.of(record(1, 10, 8), unknown));
        var row = stats.query(null, null, null, null, null, null, "ROUTE").rows().getFirst();
        assertThat(row.deduplicationUnknown()).isEqualTo(1);
        assertThat(row.unobserved()).isEqualTo(1);
        assertThat(row.inputSuccessRate()).isNull();
        assertThat(row.observedInputSuccessRate()).isEqualTo(1.0);
    }

    @Test
    void partialFieldReportsCannotAppearAsOverallSuccess() {
        var unique = new QualityMetrics.Counts(10, 10, 1, 1, 1, 1);
        var reported = new QualityMetrics.Counts(1, 1, 1, 1, 1, 1);
        var source = new QualityDailyAggregate.Contribution(1, 0, 1, new QualityMetrics.Counts(0, 0, 0, 0, 0, 0), unique, 1,
            now.minusSeconds(1), QualityExecution.Status.COMPLETED, Map.of(), QualityHistogram.empty(), QualityHistogram.empty(), 0, 0, 0, null, false, reported);
        var partial = new QualityRecord("partial-fields", QualityRecord.Kind.AGGREGATE, new QualityRecord.Group("test", "site.test", "shape", "GENERIC", "v1"),
            0, now.minusSeconds(3600), now.plusSeconds(86400), new QualityDailyAggregate(Map.of("partial-fields", source)));
        when(store.list(any(), any())).thenReturn(List.of(partial));
        var row = stats.query(null, null, null, null, null, null, "ROUTE").rows().getFirst();
        assertThat(row.inputSuccessRate()).isNull();
        assertThat(row.bindingRate()).isNull();
        assertThat(row.retentionRate()).isNull();
        assertThat(row.observedRetentionRate()).isEqualTo(1.0);
        assertThat(row.observedInputSuccessRate()).isEqualTo(1.0);
        assertThat(row.unobserved()).isEqualTo(1);
    }
}
