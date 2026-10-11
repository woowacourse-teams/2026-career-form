package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("품질 데이터 조회 및 보고 보존 경계")
class QualityRetentionTest {

    private static final Instant STARTED = Instant.parse("2026-10-06T14:00:00Z");

    @Test
    @DisplayName("상세 기록은 30일 경계부터 제외하고 미래 기록은 노출하지 않는다")
    void excludesExpiredAndFutureDetails() {
        assertThat(QualityRetention.detailsVisible(STARTED, Instant.parse("2026-11-05T13:59:59Z"))).isTrue();
        assertThat(QualityRetention.detailsVisible(STARTED, Instant.parse("2026-11-05T14:00:00Z"))).isFalse();
        assertThat(QualityRetention.detailsVisible(STARTED, Instant.parse("2026-10-06T13:59:59Z"))).isFalse();
    }

    @Test
    @DisplayName("일별 집계는 한국 날짜 기준 90일 경계부터 조회하지 않는다")
    void expiresDailyAggregatesAtKoreanDayBoundary() {
        assertThat(QualityRetention.aggregateVisible(STARTED, Instant.parse("2027-01-03T14:59:59Z"))).isTrue();
        assertThat(QualityRetention.aggregateVisible(STARTED, Instant.parse("2027-01-03T15:00:00Z"))).isFalse();
        assertThat(QualityRetention.aggregateVisible(STARTED, Instant.parse("2026-10-05T14:59:59Z"))).isFalse();
    }

    @Test
    @DisplayName("보고 토큰은 24시간 경계에 만료되고 미관측 종료 후에도 지연 보고를 허용한다")
    void acceptsLateReportsOnlyBeforeTokenExpiry() {
        assertThat(QualityRetention.reportAllowed(STARTED, Instant.parse("2026-10-06T14:30:00Z"))).isTrue();
        assertThat(QualityRetention.reportAllowed(STARTED, Instant.parse("2026-10-07T13:59:59Z"))).isTrue();
        assertThat(QualityRetention.reportAllowed(STARTED, Instant.parse("2026-10-07T14:00:00Z"))).isFalse();
        assertThat(QualityRetention.reportAllowed(STARTED, Instant.parse("2026-10-06T13:59:59Z"))).isFalse();
        assertThat(QualityRetention.provisionallyUnobserved(STARTED,
            Instant.parse("2026-10-06T14:29:59Z"))).isFalse();
        assertThat(QualityRetention.provisionallyUnobserved(STARTED,
            Instant.parse("2026-10-06T14:30:00Z"))).isTrue();
    }

    @Test
    @DisplayName("허용 조회 기간을 초과하거나 뒤집힌 범위를 거부한다")
    void rejectsUnboundedAndReversedQueries() {
        assertThatThrownBy(() -> QualityRetention.checkRange(STARTED, STARTED.minusSeconds(1), false))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> QualityRetention.checkRange(STARTED,
            Instant.parse("2026-11-05T14:00:01Z"), false)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> QualityRetention.checkRange(STARTED,
            Instant.parse("2027-01-04T14:00:01Z"), true)).isInstanceOf(IllegalArgumentException.class);
        QualityRetention.checkRange(STARTED, Instant.parse("2026-11-05T14:00:00Z"), false);
        QualityRetention.checkRange(STARTED, Instant.parse("2027-01-04T14:00:00Z"), true);
    }
}
