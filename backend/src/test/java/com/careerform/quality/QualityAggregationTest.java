package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("자동 입력 품질 지표 집계")
class QualityAggregationTest {

    @Test
    @DisplayName("표본 크기가 다른 실행은 백분율 평균 대신 건수를 합산한다")
    void aggregatesCountsBeforeComputingRates() {
        var first = new QualityMetrics.Counts(10, 8, 8, 8, 8, 8);
        var second = new QualityMetrics.Counts(90, 9, 9, 9, 9, 9);

        var combined = first.plus(second);

        assertThat(combined.discovered()).isEqualTo(100);
        assertThat(combined.mapped()).isEqualTo(17);
        assertThat(combined.ratios().mapping()).isEqualTo(0.17);
        assertThat(combined.ratios().inputSuccess()).isEqualTo(1.0);
        assertThat(first.discovered()).isEqualTo(10);
    }

    @Test
    @DisplayName("0분모는 0퍼센트나 성공으로 표시하지 않는다")
    void distinguishesUnavailableRatesFromZeroSuccess() {
        var empty = new QualityMetrics.Counts(0, 0, 0, 0, 0, 0);
        var noMapping = new QualityMetrics.Counts(5, 0, 0, 0, 0, 0);

        assertThat(empty.ratios().mapping()).isNull();
        assertThat(empty.ratios().inputSuccess()).isNull();
        assertThat(empty.ratios().retention()).isNull();
        assertThat(noMapping.ratios().mapping()).isZero();
        assertThat(noMapping.ratios().binding()).isNull();
    }

    @Test
    @DisplayName("사람 기준 커버리지와 관측 후보 기준 비율을 함께 제공한다")
    void separatesHumanCoverageFromObservedRates() {
        var counts = new QualityMetrics.Counts(10, 8, 8, 8, 8, 8);

        var coverage = counts.coverage(20L, true);

        assertThat(coverage.status()).isEqualTo(QualityMetrics.CoverageStatus.REFERENCE);
        assertThat(coverage.discovered()).isEqualTo(0.5);
        assertThat(coverage.mapped()).isEqualTo(0.4);
        assertThat(coverage.written()).isEqualTo(0.4);
        assertThat(coverage.retained()).isEqualTo(0.4);
        assertThat(counts.ratios().collectedRetention()).isEqualTo(0.8);
    }

    @Test
    @DisplayName("분모가 미등록이거나 범위가 맞지 않으면 커버리지를 만들지 않는다")
    void doesNotReuseUnconfirmedOrIncompatibleDenominators() {
        var counts = new QualityMetrics.Counts(10, 8, 8, 8, 8, 8);

        assertThat(counts.coverage(null, true).status())
            .isEqualTo(QualityMetrics.CoverageStatus.UNREGISTERED);
        assertThat(counts.coverage(20L, false).status())
            .isEqualTo(QualityMetrics.CoverageStatus.SCOPE_MISMATCH);
        assertThat(counts.coverage(5L, true).status())
            .isEqualTo(QualityMetrics.CoverageStatus.SCOPE_MISMATCH);
        assertThat(counts.coverage(5L, true).retained()).isNull();
        assertThat(new QualityMetrics.Counts(0, 0, 0, 0, 0, 0)
            .coverage(0L, true).retained()).isNull();
    }

    @Test
    @DisplayName("음수와 단계 수량 역행 및 합산 오버플로를 거부한다")
    void rejectsInvalidStageCounts() {
        assertThatThrownBy(() -> new QualityMetrics.Counts(-1, 0, 0, 0, 0, 0))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new QualityMetrics.Counts(1, 2, 0, 0, 0, 0))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new QualityMetrics.Counts(1, 1, 1, 0, 1, 0))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new QualityMetrics.Counts(1, 1, 1, 1, 0, 1))
            .isInstanceOf(IllegalArgumentException.class);
        var large = new QualityMetrics.Counts(Long.MAX_VALUE, 0, 0, 0, 0, 0);
        assertThatThrownBy(() -> large.plus(new QualityMetrics.Counts(1, 0, 0, 0, 0, 0)))
            .isInstanceOf(ArithmeticException.class);
    }
}
