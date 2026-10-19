package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class QualityTaskQueueTest {
    @Test
    void failureReleasesCapacityWithoutCopyingRequestScope() throws Exception {
        var meters = new SimpleMeterRegistry();
        var completed = new CountDownLatch(1);
        try (var queue = new QualityTaskQueue(1, 10, 10, Duration.ofSeconds(30), Clock.systemUTC(), meters);
             var scope = QualityScope.open()) {
            assertThat(queue.submit(10, () -> {
                if (QualityScope.current().isPresent()) { throw new AssertionError("request scope leaked"); }
                throw new IllegalStateException("synthetic failure");
            })).isTrue();
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
                assertThat(queue.retainedBytes()).isZero();
                assertThat(meters.get("quality.tasks").tag("outcome", "failed").counter().count()).isEqualTo(1);
            });
            assertThat(QualityScope.current()).contains(scope);
            assertThat(queue.submit(10, () -> { completed.countDown(); return true; })).isTrue();
            assertThat(completed.await(2, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void cancellationDoesNotReleaseMemoryOfAStillRunningTask() throws Exception {
        var entered = new CountDownLatch(1);
        var interrupted = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var queue = new QualityTaskQueue(2, 20, 20, Duration.ofSeconds(30), Clock.systemUTC(), new SimpleMeterRegistry());
        try {
            queue.submit(10, () -> {
                entered.countDown();
                try { release.await(); }
                catch (InterruptedException exception) { interrupted.countDown(); release.await(); }
                return true;
            });
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            queue.submit(10, () -> { throw new AssertionError("cancelled queued job ran"); });
            queue.close();
            assertThat(interrupted.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(queue.active()).isEqualTo(1);
            assertThat(queue.retainedBytes()).isEqualTo(10);
        } finally { release.countDown(); }
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
            assertThat(queue.active()).isZero();
            assertThat(queue.retainedBytes()).isZero();
        });
    }

    @Test
    void blockedDatabaseDoesNotBlockAdmissionAndRetainsBudgetUntilActualExit() throws Exception {
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var finished = new CountDownLatch(1);
        try (var queue = new QualityTaskQueue(2, 20, 20, Duration.ofSeconds(30), Clock.systemUTC(), new SimpleMeterRegistry())) {
            try {
                assertThat(queue.submit(10, () -> {
                    started.countDown();
                    release.await();
                    return true;
                })).isTrue();
                assertThat(started.await(1, TimeUnit.SECONDS)).isTrue();
                assertThat(queue.submit(10, () -> { finished.countDown(); return true; })).isTrue();
                assertThat(queue.submit(1, () -> true)).isFalse();
                assertThat(queue.retainedBytes()).isEqualTo(20);
                assertThat(queue.active()).isEqualTo(1);
            } finally { release.countDown(); }
            assertThat(finished.await(1, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void byteLimitAndEventLimitRejectWithoutRunningOnCaller() throws Exception {
        var blocked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var queue = new QualityTaskQueue(10, 10, 8, Duration.ofSeconds(30), Clock.systemUTC(), new SimpleMeterRegistry())) {
            try {
                assertThat(queue.submit(8, () -> { blocked.countDown(); release.await(); return true; })).isTrue();
                assertThat(blocked.await(1, TimeUnit.SECONDS)).isTrue();
                assertThat(queue.submit(3, () -> { throw new AssertionError("must not run"); })).isFalse();
                assertThat(queue.submit(9, () -> true)).isFalse();
            } finally { release.countDown(); }
        }
    }

    @Test
    void deferredJobExpiresAndShutdownRejects() throws Exception {
        var meters = new SimpleMeterRegistry();
        var retried = new CountDownLatch(2);
        var now = new java.util.concurrent.atomic.AtomicReference<>(Instant.parse("2030-01-01T00:00:00Z"));
        var clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        var queue = new QualityTaskQueue(1, 10, 10, Duration.ofSeconds(30), clock, meters);
        assertThat(queue.submit(5, () -> { retried.countDown(); return false; })).isTrue();
        assertThat(retried.await(2, TimeUnit.SECONDS)).isTrue();
        now.set(Instant.parse("2030-01-01T00:00:30Z"));
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
            assertThat(queue.retainedBytes()).isZero();
            assertThat(meters.get("quality.tasks").tag("outcome", "expired").counter().count()).isEqualTo(1);
        });
        queue.close();
        assertThat(queue.submit(1, () -> true)).isFalse();
    }
}
