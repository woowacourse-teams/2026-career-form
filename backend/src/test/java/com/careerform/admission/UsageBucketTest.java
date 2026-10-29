package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class UsageBucketTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");

    @Test
    void reservesLastUnitAndReturnsItOnlyOnce() {
        var bucket = UsageBucket.empty("test", 1, NOW.plusSeconds(90000));
        var reserved = bucket.reserve("call", NOW.plusSeconds(120), NOW);
        assertThat(reserved.used()).isEqualTo(1);
        assertThatThrownBy(() -> reserved.reserve("another", NOW.plusSeconds(120), NOW)).isInstanceOf(AdmissionFailure.class);
        var returned = reserved.settle("call", false, NOW);
        assertThat(returned.used()).isZero();
        assertThat(returned.settle("call", false, NOW).used()).isZero();
        assertThat(returned.settle("call", true, NOW).used()).isZero();
    }

    @Test
    void expiresAbandonedReservationsButDoesNotRefundSuccessfulCalls() {
        var bucket = UsageBucket.empty("test", 3, NOW.plusSeconds(90000))
            .reserve("success", NOW.plusSeconds(120), NOW).settle("success", true, NOW)
            .reserve("lost", NOW.plusSeconds(120), NOW);
        var expired = bucket.expire(NOW.plusSeconds(120));
        assertThat(expired.used()).isEqualTo(1);
        assertThat(expired.settle("lost", true, NOW.plusSeconds(121)).used()).isEqualTo(1);
        assertThat(expired.entries().get("lost").state()).isEqualTo(UsageBucket.State.EXPIRED);
    }

    @Test
    void confirmedUnsentApprovalCanBeCancelledOnlyOnce() {
        var committed = UsageBucket.empty("test", 1, NOW.plusSeconds(90000))
            .reserve("send", NOW.plusSeconds(120), NOW).settle("send", true, NOW);
        assertThat(committed.expire(NOW.plusSeconds(121)).used()).isEqualTo(1);
        assertThat(committed.settle("send", false, NOW).used()).isEqualTo(1);
        var cancelled = committed.cancelApproval("send");
        assertThat(cancelled.used()).isZero();
        assertThat(cancelled.cancelApproval("send").used()).isZero();
    }

    @Test
    void internalDuplicateReservationDoesNotConsumeAnotherUnit() {
        var first = UsageBucket.empty("test", 2, NOW.plusSeconds(90000)).reserve("same", NOW.plusSeconds(120), NOW);
        assertThat(first.reserve("same", NOW.plusSeconds(120), NOW).used()).isEqualTo(1);
    }
    @Test
    void changedSlotLimitTakesEffectWithoutDiscardingRunningApprovals() {
        var slots = UsageBucket.empty("slots:test", 10, null).reserve("running", NOW.plusSeconds(120), NOW);
        var tightened = slots.compactSlots(NOW, 1);
        assertThatThrownBy(() -> tightened.reserve("new", NOW.plusSeconds(120), NOW)).isInstanceOf(AdmissionFailure.class);
        var expanded = tightened.compactSlots(NOW, 2).reserve("new", NOW.plusSeconds(120), NOW);
        assertThat(expanded.used()).isEqualTo(2);
        assertThat(expanded.entries().get("running").state()).isEqualTo(UsageBucket.State.RESERVED);
    }

}
