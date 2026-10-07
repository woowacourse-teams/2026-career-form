package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("실행 품질 결과 보고 계약")
class QualityReportingApiTest {

    private static final Instant START = Instant.parse("2026-10-06T00:20:00Z");

    @Test
    @DisplayName("같은 이벤트 재전송과 뒤늦은 이전 단계 보고는 수량을 부풀리지 않는다")
    void mergesProgressAndDeduplicatesEvents() {
        var initial = execution();
        var success = new QualityExecution.ClientState(true, true, true, true, null);
        var first = initial.report("event-1", Map.of("field-1", success), null, START.plusSeconds(1));
        var retry = first.report("event-1", Map.of("field-1", success), null, START.plusSeconds(2));
        var late = retry.report("event-2", Map.of("field-1",
            new QualityExecution.ClientState(true, false, false, false, null)), null, START.plusSeconds(3));

        assertThat(first.counts()).isEqualTo(new QualityMetrics.Counts(2, 1, 1, 1, 1, 1));
        assertThat(retry).isEqualTo(first);
        assertThat(late.counts()).isEqualTo(first.counts());
        assertThat(initial.counts()).isEqualTo(new QualityMetrics.Counts(2, 1, 0, 0, 0, 0));
    }

    @Test
    @DisplayName("서버가 매핑하지 않은 후보와 잠긴 칸의 쓰기 보고를 거부한다")
    void rejectsProgressOutsideServerObservedScope() {
        var attempted = new QualityExecution.ClientState(true, true, false, false, null);

        assertThatThrownBy(() -> execution().report("event", Map.of("unknown", attempted), null, START))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> execution().report("event", Map.of("field-2", attempted), null, START))
            .isInstanceOf(IllegalArgumentException.class);
        var locked = QualityExecution.start(START, Map.of("locked",
            new QualityExecution.Field(true, false, null)));
        assertThatThrownBy(() -> locked.report("event", Map.of("locked", attempted), null, START))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("단계 순서가 맞지 않는 보고는 거부한다")
    void rejectsSuccessWithoutAttemptOrRetentionWithoutWrite() {
        assertThatThrownBy(() -> new QualityExecution.ClientState(true, false, true, false, null))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new QualityExecution.ClientState(true, true, false, true, null))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> execution().report("invalid-terminal", Map.of(),
            QualityExecution.Status.RUNNING, START)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("미관측 잠정 종료와 명시적 취소 및 지연 보고를 구분한다")
    void distinguishesMissingCompletionFromCancellation() {
        var initial = execution();

        assertThat(initial.status(START.plusSeconds(1799))).isEqualTo(QualityExecution.Status.RUNNING);
        assertThat(initial.status(START.plusSeconds(1800))).isEqualTo(QualityExecution.Status.UNOBSERVED);
        var cancelled = initial.report("cancel", Map.of(), QualityExecution.Status.CANCELLED,
            START.plusSeconds(1801));
        assertThat(cancelled.status(START.plusSeconds(1900))).isEqualTo(QualityExecution.Status.CANCELLED);
        var late = initial.report("late", Map.of("field-1",
            new QualityExecution.ClientState(true, true, true, false, null)),
            QualityExecution.Status.COMPLETED, START.plusSeconds(1801));
        assertThat(late.status(START.plusSeconds(1900))).isEqualTo(QualityExecution.Status.COMPLETED);
        assertThat(late.counts().written()).isEqualTo(1);
    }

    @Test
    @DisplayName("200개 보고 한도에서도 이미 받은 이벤트의 재시도는 허용한다")
    void boundsEventsWithoutRejectingIdempotentRetries() {
        var current = execution();
        for (var index = 0; index < 200; index++) {
            current = current.report("event-" + index, Map.of(), null, START);
        }
        var full = current;

        assertThat(full.report("event-0", Map.of(), null, START)).isEqualTo(full);
        assertThatThrownBy(() -> full.report("new-event", Map.of(), null, START))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> execution().report("expired", Map.of(), null,
            Instant.parse("2026-10-07T00:20:00Z"))).isInstanceOf(IllegalArgumentException.class);
    }

    private QualityExecution execution() {
        return QualityExecution.start(START, Map.of(
            "field-1", new QualityExecution.Field(true, true, null),
            "field-2", new QualityExecution.Field(false, true, null)));
    }
}
