package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("실행 기여분을 교체하는 일별 집계")
class QualityRollupTest {
    @Test
    @DisplayName("같은 실행의 지연 보고는 이전 기여를 교체하고 오래된 revision은 무시한다")
    void replacesContributionInsteadOfSummingRetries() {
        var early = contribution(0, new QualityMetrics.Counts(2, 2, 1, 1, 0, 0));
        var late = contribution(2, new QualityMetrics.Counts(2, 2, 2, 2, 2, 2));
        var bucket = QualityDailyAggregate.empty().replace("run", early).replace("run", late).replace("run", early);
        assertThat(bucket.executionCounts()).isEqualTo(late.executionCounts());
        assertThat(bucket.executions()).isEqualTo(1);
        assertThat(bucket.contributions()).hasSize(1);
    }

    @Test
    @DisplayName("시간 분포는 같은 버킷의 건수를 합산하고 상한 초과는 근사값을 만들지 않는다")
    void computesApproximateP95FromMergedHistogram() {
        var first = QualityHistogram.sample(40).plus(QualityHistogram.sample(80));
        assertThat(first.p95()).isEqualTo(100L);
        assertThat(first.samples()).isEqualTo(2);
        assertThat(QualityHistogram.empty().p95()).isNull();
        assertThat(QualityHistogram.sample(120001).p95()).isNull();
        assertThat(QualityHistogram.sample(120001).overflow()).isEqualTo(1);
    }

    @Test
    @DisplayName("사람 기준은 유효한 실행의 분모를 합산하며 미등록과 불일치를 별도로 센다")
    void aggregatesReferenceCountsWithoutAveragingRates() {
        var small = contribution(0, new QualityMetrics.Counts(10, 8, 8, 8, 8, 8)).withReference(20L, true);
        var large = contribution(0, new QualityMetrics.Counts(90, 9, 9, 9, 9, 9)).withReference(180L, true);
        var mismatch = contribution(0, new QualityMetrics.Counts(5, 3, 2, 1, 1, 0)).withReference(2L, true);
        var bucket = QualityDailyAggregate.empty().replace("a", small).replace("b", large).replace("c", mismatch);
        assertThat(bucket.referenceDenominator()).isEqualTo(200);
        assertThat(bucket.referenceCounts().coverage(bucket.referenceDenominator(), true).mapped()).isEqualTo(17.0 / 200);
        assertThat(bucket.referenceExecutions()).isEqualTo(2);
        assertThat(bucket.scopeMismatch()).isEqualTo(1);
    }

    private QualityDailyAggregate.Contribution contribution(long revision, QualityMetrics.Counts counts) {
        return new QualityDailyAggregate.Contribution(revision, 0, 1, counts, counts, counts.discovered(),
            Instant.parse("2030-01-01T00:30:00Z"), QualityExecution.Status.COMPLETED, Map.of(),
            QualityHistogram.empty(), QualityHistogram.empty(), 0, 0, 0, null, false);
    }
}
