package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("기간별 발송 요약")
class AdminSummaryTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final JobPostingService service = new JobPostingService(store, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("수락률·포기율은 끝난 발송 기준, 평균 시도는 전체 발송 기준이고 지연 백분위는 최근접 순위다")
    void computesRatesAndPercentiles() {
        store.insertSubscription(new PushSubscription("s1", "https://fcm.googleapis.com/fcm/send/s1", "p", "a", NOW));
        store.insertPosting(new JobPosting("p1", "합성 회사", null, "https://careers.example.test/jobs/1", NOW.minusSeconds(60), NOW.plusSeconds(7200), NOW.minusSeconds(60)));
        var lease = NOW.plusSeconds(120);
        var scheduled = NOW.minusSeconds(600);
        store.insertDeliveries(List.of(
            PushDelivery.pending("a", "p1", "s1", scheduled).claimed(scheduled.plusSeconds(10), lease).accepted(201),
            PushDelivery.pending("b", "p1", "s2", scheduled).claimed(scheduled.plusSeconds(20), lease).accepted(201),
            PushDelivery.pending("c", "p1", "s3", scheduled).claimed(scheduled.plusSeconds(5), lease).retry(scheduled.plusSeconds(30), 503, "SERVER_ERROR")
                .claimed(scheduled.plusSeconds(30), lease).accepted(201),
            PushDelivery.pending("d", "p1", "s4", scheduled).claimed(scheduled.plusSeconds(40), lease).accepted(201),
            PushDelivery.pending("e", "p1", "s5", scheduled).claimed(scheduled.plusSeconds(1), lease).abandoned(410, "GONE"),
            PushDelivery.pending("f", "p1", "s6", NOW.plusSeconds(60))));

        var summary = service.summary(NOW.minusSeconds(3600), NOW.plusSeconds(3600));
        assertThat(summary.postings()).isEqualTo(1);
        assertThat(summary.deliveries()).isEqualTo(new DeliverySummary(1, 0, 4, 1, 1 + 1 + 2 + 1 + 1, 20_000L, 40_000L));
        assertThat(summary.acceptanceRate()).isEqualTo(0.8);
        assertThat(summary.abandonRate()).isEqualTo(0.2);
        assertThat(summary.averageAttempts()).isEqualTo(1.0);
        assertThat(summary.subscriptions()).isEqualTo(1);

        var empty = service.summary(NOW.plusSeconds(10_000), NOW.plusSeconds(20_000));
        assertThat(empty.deliveries()).isEqualTo(new DeliverySummary(0, 0, 0, 0, 0, null, null));
        assertThat(empty.acceptanceRate()).isNull();
        assertThat(empty.abandonRate()).isNull();
        assertThat(empty.averageAttempts()).isNull();
    }

    @Test
    @DisplayName("기간은 시작이 끝보다 앞서야 하고 400일을 넘지 않는다")
    void rejectsInvalidRanges() {
        assertThatThrownBy(() -> service.summary(NOW, NOW)).isInstanceOf(JobPostingService.InvalidRange.class);
        assertThatThrownBy(() -> service.summary(NOW.plusSeconds(1), NOW)).isInstanceOf(JobPostingService.InvalidRange.class);
        assertThatThrownBy(() -> service.summary(null, NOW)).isInstanceOf(JobPostingService.InvalidRange.class);
        assertThatThrownBy(() -> service.summary(NOW.minus(Duration.ofDays(401)), NOW)).isInstanceOf(JobPostingService.InvalidRange.class);
        assertThat(service.summary(NOW.minus(Duration.ofDays(400)), NOW).postings()).isZero();
    }
}
