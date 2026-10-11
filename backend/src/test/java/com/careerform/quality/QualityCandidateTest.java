package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("필드 수 확인 후보 선정")
class QualityCandidateTest {

    private static final Instant FRIDAY = Instant.parse("2026-10-09T00:20:00Z");

    @Test
    @DisplayName("한국 평일 오전 9시 20분 이후에만 후보를 선정한다")
    void usesKoreanWeekdaysAndNotificationTime() {
        assertThat(QualitySelection.isNotificationTime(FRIDAY)).isTrue();
        assertThat(QualitySelection.isNotificationTime(FRIDAY.minusSeconds(1))).isFalse();
        assertThat(QualitySelection.isNotificationTime(FRIDAY.plus(1, ChronoUnit.DAYS))).isFalse();
        assertThat(QualitySelection.isNotificationTime(FRIDAY.plus(2, ChronoUnit.DAYS))).isFalse();
        assertThat(QualitySelection.isNotificationTime(FRIDAY.plus(3, ChronoUnit.DAYS))).isTrue();
    }

    @Test
    @DisplayName("미완료 두 개를 유지하고 오래 대기한 경로 두 개와 개선 후보 한 개를 추가한다")
    void preservesPendingWorkAndRotatesAgingSlots() {
        var candidates = List.of(
            candidate("active-1", QualitySelection.Route.STATIC, 1, true, 0, 0, 0),
            candidate("active-2", QualitySelection.Route.GENERIC, 2, true, 0, 0, 0),
            candidate("old-static", QualitySelection.Route.STATIC, 10, false, 10, 10, 0),
            candidate("old-greeting", QualitySelection.Route.GREETING, 20, false, 10, 10, 0),
            candidate("old-generic", QualitySelection.Route.GENERIC, 30, false, 10, 10, 0),
            candidate("low-success", QualitySelection.Route.GENERIC, 1, false, 100, 100, 20)
        );

        var batch = QualitySelection.select(FRIDAY, candidates, QualitySelection.Route.STATIC);

        assertThat(batch.active()).extracting(QualitySelection.Candidate::id)
            .containsExactly("active-2", "active-1");
        assertThat(batch.newRequests()).extracting(QualitySelection.Candidate::id)
            .containsExactly("old-static", "old-greeting", "low-success");
        assertThat(batch.nextRoute()).isEqualTo(QualitySelection.Route.GENERIC);
        assertThat(batch.active().size() + batch.newRequests().size()).isEqualTo(5);
        assertThat(candidates).hasSize(6);
    }

    @Test
    @DisplayName("활성 요청이 다섯 개면 새 후보를 선정하지 않고 순환 지점을 유지한다")
    void doesNotOverbookOrAdvanceRotationWithoutCapacity() {
        var candidates = List.of(
            candidate("a", QualitySelection.Route.STATIC, 1, true, 0, 0, 0),
            candidate("b", QualitySelection.Route.STATIC, 2, true, 0, 0, 0),
            candidate("c", QualitySelection.Route.STATIC, 3, true, 0, 0, 0),
            candidate("d", QualitySelection.Route.STATIC, 4, true, 0, 0, 0),
            candidate("e", QualitySelection.Route.STATIC, 5, true, 0, 0, 0),
            candidate("old", QualitySelection.Route.GREETING, 50, false, 0, 0, 0)
        );

        var batch = QualitySelection.select(FRIDAY, candidates, QualitySelection.Route.GREETING);

        assertThat(batch.active()).hasSize(5);
        assertThat(batch.newRequests()).isEmpty();
        assertThat(batch.nextRoute()).isEqualTo(QualitySelection.Route.GREETING);
    }

    @Test
    @DisplayName("보류 후보는 재확인일까지 배정하지 않고 담당 중인 후보는 신규로 배정하지 않는다")
    void excludesDeferredAndAlreadyClaimedWork() {
        var empty = new QualityMetrics.Counts(0, 0, 0, 0, 0, 0);
        var deferred = new QualitySelection.Candidate("deferred", QualitySelection.Route.STATIC,
            FRIDAY.minus(30, ChronoUnit.DAYS), false, false, FRIDAY.plusSeconds(1), 0, empty);
        var claimed = new QualitySelection.Candidate("claimed", QualitySelection.Route.GREETING,
            FRIDAY.minus(20, ChronoUnit.DAYS), false, true, null, 0, empty);

        var batch = QualitySelection.select(FRIDAY, List.of(deferred, claimed), QualitySelection.Route.STATIC);

        assertThat(batch.active()).extracting(QualitySelection.Candidate::id).containsExactly("claimed");
        assertThat(batch.newRequests()).isEmpty();
        assertThat(QualitySelection.select(FRIDAY.plusSeconds(1), List.of(deferred),
            QualitySelection.Route.STATIC).newRequests()).hasSize(1);
    }

    @Test
    @DisplayName("표본이 부족한 실패를 우선하지 않고 충분한 표본의 낮은 입력 성공률을 먼저 선택한다")
    void prioritizesSupportedRatesBeforeLowSampleFailures() {
        var candidates = List.of(
            candidate("old-1", QualitySelection.Route.STATIC, 50, false, 0, 0, 0),
            candidate("old-2", QualitySelection.Route.STATIC, 40, false, 0, 0, 0),
            candidate("tiny", QualitySelection.Route.STATIC, 1, false, 1, 1, 1),
            candidate("mapping", QualitySelection.Route.STATIC, 1, false, 100, 1, 0),
            candidate("success", QualitySelection.Route.STATIC, 1, false, 100, 100, 20),
            candidate("usage", QualitySelection.Route.STATIC, 1, false, 1000, 1000, 0)
        );

        var batch = QualitySelection.select(FRIDAY, candidates, QualitySelection.Route.STATIC);

        assertThat(batch.newRequests()).extracting(QualitySelection.Candidate::id)
            .containsExactly("old-1", "old-2", "success", "mapping", "usage");
    }

    @Test
    @DisplayName("후보 식별자 중복과 음수 표본을 거부한다")
    void rejectsDuplicateIdentityAndInvalidSamples() {
        var same = candidate("same", QualitySelection.Route.STATIC, 1, false, 0, 0, 0);

        assertThatThrownBy(() -> QualitySelection.select(FRIDAY, List.of(same, same),
            QualitySelection.Route.STATIC)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new QualitySelection.Candidate("invalid", QualitySelection.Route.STATIC,
            FRIDAY, false, false, null, -1, new QualityMetrics.Counts(0, 0, 0, 0, 0, 0)))
            .isInstanceOf(IllegalArgumentException.class);
    }

    private static QualitySelection.Candidate candidate(String id, QualitySelection.Route route,
        int waitingDays, boolean active, long collected, long mapped, long attempted) {
        return new QualitySelection.Candidate(id, route, FRIDAY.minus(waitingDays, ChronoUnit.DAYS),
            active, false, null, collected, new QualityMetrics.Counts(collected, mapped, mapped, attempted, 0, 0));
    }
}
