package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

class QualityObservationExecutorTest {
    @Test
    void returnsCompletedObservationWithoutMovingRequestScope() {
        try (var observer = new QualityObservationExecutor(); var scope = QualityScope.open()) {
            assertThat(observer.observe(() -> QualityScope.current().isEmpty())).isTrue();
            assertThat(QualityScope.current()).contains(scope);
        }
    }

    @Test
    void callbackFailureDoesNotEscapeIntoTheCaller() {
        try (var observer = new QualityObservationExecutor()) {
            assertThat(observer.<String>observe(() -> { throw new IllegalStateException("synthetic-private-marker"); })).isNull();
        }
    }

    @Test
    void timeoutCancelsTheWorkerAndAllowsAnotherObservation() throws Exception {
        var interrupted = new CountDownLatch(1);
        try (var observer = new QualityObservationExecutor()) {
            org.junit.jupiter.api.Assertions.assertTimeout(Duration.ofSeconds(2), () ->
                assertThat(observer.observe(() -> {
                    try { new CountDownLatch(1).await(); }
                    catch (InterruptedException exception) { interrupted.countDown(); throw exception; }
                    return "unreachable";
                })).isNull());
            assertThat(interrupted.await(1, TimeUnit.SECONDS)).isTrue();
            assertThat(observer.observe(() -> "next")).isEqualTo("next");
        }
    }

    @Test
    void preservesCallerInterruptionWithoutThrowing() {
        try (var observer = new QualityObservationExecutor()) {
            Thread.currentThread().interrupt();
            assertThat(observer.observe(() -> "unused")).isNull();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();
        }
    }

    @Test
    void shutdownRejectsFurtherObservationsWithoutThrowing() {
        var observer = new QualityObservationExecutor();
        observer.close();
        assertThat(observer.observe(() -> "unused")).isNull();
    }
}
