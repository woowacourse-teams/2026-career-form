package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class QualityRegistrationTest {
    @Test
    void rejectedAdmissionDoesNotConsumeRegistrationOrDeduplicationCapacity() {
        var registration = new QualityRegistration(1, Clock.systemUTC(), new SimpleMeterRegistry());
        var input = new QualityRegistration.Input("a".repeat(32), "b".repeat(64));
        assertThatThrownBy(() -> registration.register(input, ignored -> false)).isInstanceOf(QualityAdmissionException.class);
        var receipt = registration.register(input, context -> {
            assertThat(context.toString()).doesNotContain(input.key());
            return true;
        });
        assertThatThrownBy(() -> registration.report(receipt.runId(), receipt.token(), "event", ignored -> false))
            .isInstanceOf(QualityAdmissionException.class);
        var admitted = new AtomicInteger();
        registration.report(receipt.runId(), receipt.token(), "event", ignored -> { admitted.incrementAndGet(); return true; });
        registration.report(receipt.runId(), receipt.token(), "event", ignored -> { admitted.incrementAndGet(); return true; });
        assertThat(admitted.get()).isEqualTo(1);
        assertThatThrownBy(() -> registration.register(new QualityRegistration.Input("c".repeat(32), "d".repeat(64)), ignored -> true))
            .isInstanceOf(QualityAdmissionException.class).satisfies(exception -> assertThat(((QualityAdmissionException) exception).status()).isEqualTo(429));
    }

    @Test
    void expiresAt24HoursAndDoesNotTreatPublicRunIdentifierAsAuthority() {
        var time = new AtomicReference<>(Instant.parse("2030-01-01T00:00:00Z"));
        var clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return time.get(); }
        };
        var registration = new QualityRegistration(2, clock, new SimpleMeterRegistry());
        var input = new QualityRegistration.Input("a".repeat(32), "b".repeat(64));
        var receipt = registration.register(input, ignored -> true);
        var foreign = registration.register(new QualityRegistration.Input(input.clientRun(), "c".repeat(64)), ignored -> true);
        assertThat(receipt.runId()).isNotEqualTo(foreign.runId());
        assertThatThrownBy(() -> registration.report(receipt.runId(), foreign.token(), "event", ignored -> true))
            .isInstanceOf(QualityAdmissionException.class);
        time.set(time.get().plusSeconds(86400));
        assertThat(registration.find(registration.connection(input.clientRun(), input.key()))).isNull();
        assertThatThrownBy(() -> registration.report(receipt.runId(), receipt.token(), "event", ignored -> true))
            .isInstanceOf(QualityAdmissionException.class);
    }
}
