package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.time.Duration;
import org.junit.jupiter.api.Test;

class ExecutionGateTest {
    @Test
    void rejectsWhenWaitingCapacityIsExhaustedAndReleasesEverySlot() throws Exception {
        var gate = new ExecutionGate(1, 0, Duration.ofMillis(10));
        try (var active = gate.acquire(System.nanoTime() + 1_000_000_000L)) {
            assertThat(gate.active()).isEqualTo(1);
            assertThatThrownBy(() -> gate.acquire(System.nanoTime() + 1_000_000_000L))
                .isInstanceOfSatisfying(AdmissionFailure.class, failure -> assertThat(failure.code()).isEqualTo("AI_BUSY"));
        }
        assertThat(gate.active()).isZero();
        assertThat(gate.waiting()).isZero();
        try (var next = gate.acquire(System.nanoTime() + 1_000_000_000L)) { assertThat(gate.active()).isEqualTo(1); }
    }

    @Test
    void expiredRequestCannotStartEvenWhenThereIsCapacity() {
        var gate = new ExecutionGate(2, 2, Duration.ofMillis(10));
        assertThatThrownBy(() -> gate.acquire(System.nanoTime() - 1)).isInstanceOf(AdmissionFailure.class);
        assertThat(gate.active()).isZero();
    }
    @Test
    void boundsWaitersAndReturnsWaitingSlotAfterInterruption() throws Exception {
        var gate = new ExecutionGate(1, 1, Duration.ofSeconds(5));
        var outcome = new java.util.concurrent.CompletableFuture<String>();
        try (var held = gate.acquire(System.nanoTime() + 10_000_000_000L)) {
            var waiter = Thread.startVirtualThread(() -> {
                try (var permit = gate.acquire(System.nanoTime() + 10_000_000_000L)) { outcome.complete("unexpected"); }
                catch (AdmissionFailure error) { outcome.complete(error.code()); }
            });
            var until = System.nanoTime() + 2_000_000_000L;
            while (gate.waiting() == 0 && System.nanoTime() < until) Thread.sleep(5);
            assertThat(gate.waiting()).isEqualTo(1);
            assertThatThrownBy(() -> gate.acquire(System.nanoTime() + 10_000_000_000L)).isInstanceOf(AdmissionFailure.class);
            waiter.interrupt();
            assertThat(outcome.get(2, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo("ANALYSIS_CANCELLED");
            waiter.join();
            assertThat(gate.waiting()).isZero();
        }
        assertThat(gate.active()).isZero();
    }

}
