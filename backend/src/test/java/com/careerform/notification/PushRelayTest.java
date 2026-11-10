package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@DisplayName("발송 릴레이")
@ExtendWith(OutputCaptureExtension.class)
class PushRelayTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final Duration QUEUE_LEASE = Duration.ofMinutes(15);
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final MutableClock clock = new MutableClock(NOW);
    private final MemoryPushQueue queue = new MemoryPushQueue(clock);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final PushDispatchMetrics metrics = new PushDispatchMetrics(meters, new ExternalCallMetrics(meters));
    private final PushSettings settings = PushSettings.defaults();
    private final PushRelay relay = new PushRelay(store, queue, settings, QUEUE_LEASE, clock, metrics);

    @Test
    @DisplayName("예정 시각이 지난 대기 건의 ID를 큐에 넣고 큐 대기로 표시하며 다음 주기에는 다시 넣지 않는다")
    void enqueuesDuePendingAndMarksQueued(CapturedOutput output) {
        store.insertDeliveries(List.of(PushDelivery.pending("d1", "p1", "s1", NOW.minusSeconds(30)), PushDelivery.pending("d2", "p1", "s2", NOW),
            PushDelivery.pending("future", "p1", "s3", NOW.plusSeconds(1))));
        var cycle = relay.relay();
        assertThat(cycle.due()).isEqualTo(2);
        assertThat(cycle.queued()).isEqualTo(2);
        assertThat(cycle.failed()).isZero();
        assertThat(cycle.skipped()).isZero();
        assertThat(queue.visibleBodies()).containsExactly("d1", "d2");
        assertThat(List.of(store.findDelivery("d1").orElseThrow(), store.findDelivery("d2").orElseThrow())).allSatisfy(delivery -> {
            assertThat(delivery.status()).isEqualTo(PushDelivery.Status.QUEUED);
            assertThat(delivery.leaseUntil()).isEqualTo(NOW.plus(QUEUE_LEASE));
            assertThat(delivery.attempts()).isZero();
        });
        assertThat(store.findDelivery("future").orElseThrow().status()).isEqualTo(PushDelivery.Status.PENDING);
        assertThat(output).contains("PUSH_RELAY_CYCLE due=2 queued=2 failed=0 skipped=0");
        var next = relay.relay();
        assertThat(next.due()).isZero();
        assertThat(queue.size()).isEqualTo(2);
    }

    @Test
    @DisplayName("큐가 거절한 건은 대기로 남기고 다음 주기에 다시 넣는다")
    void leavesRejectedDeliveriesPending() {
        store.insertDeliveries(List.of(PushDelivery.pending("d1", "p1", "s1", NOW), PushDelivery.pending("d2", "p1", "s2", NOW)));
        queue.reject("d2");
        var cycle = relay.relay();
        assertThat(cycle.queued()).isEqualTo(1);
        assertThat(cycle.failed()).isEqualTo(1);
        assertThat(store.findDelivery("d2").orElseThrow().status()).isEqualTo(PushDelivery.Status.PENDING);
        queue.acceptAll();
        assertThat(relay.relay().queued()).isEqualTo(1);
        assertThat(queue.visibleBodies()).containsExactly("d1", "d2");
    }

    @Test
    @DisplayName("큐 호출이 실패하면 그 묶음을 모두 대기로 남기고 주기는 끝까지 돈다")
    void survivesQueueFailure(CapturedOutput output) {
        store.insertDeliveries(List.of(PushDelivery.pending("d1", "p1", "s1", NOW)));
        queue.failSends(new IllegalStateException("synthetic"));
        var cycle = relay.relay();
        assertThat(cycle.failed()).isEqualTo(1);
        assertThat(cycle.queued()).isZero();
        assertThat(store.findDelivery("d1").orElseThrow().status()).isEqualTo(PushDelivery.Status.PENDING);
        assertThat(output).contains("PUSH_RELAY_SEND_FAILED failure=IllegalStateException");
    }

    @Test
    @DisplayName("큐 대기인 채 큐 리스가 지나면 다시 넣고 리스를 갱신한다")
    void requeuesAfterQueueLease() {
        store.insertDeliveries(List.of(PushDelivery.pending("d1", "p1", "s1", NOW)));
        relay.relay();
        queue.lose();
        clock.set(NOW.plus(QUEUE_LEASE).minusSeconds(1));
        assertThat(relay.relay().due()).isZero();
        clock.set(NOW.plus(QUEUE_LEASE));
        assertThat(relay.relay().queued()).isEqualTo(1);
        assertThat(queue.visibleBodies()).containsExactly("d1");
        assertThat(store.findDelivery("d1").orElseThrow().leaseUntil()).isEqualTo(NOW.plus(QUEUE_LEASE).plus(QUEUE_LEASE));
    }

    @Test
    @DisplayName("리스가 지난 발송 중 건을 다시 넣고 시도 횟수는 올리지 않는다")
    void requeuesExpiredSending() {
        store.insertDeliveries(List.of(PushDelivery.pending("d1", "p1", "s1", NOW.minusSeconds(600)).claimed(NOW.minusSeconds(300), NOW.minusSeconds(180))));
        assertThat(relay.relay().queued()).isEqualTo(1);
        var requeued = store.findDelivery("d1").orElseThrow();
        assertThat(requeued.status()).isEqualTo(PushDelivery.Status.QUEUED);
        assertThat(requeued.attempts()).isEqualTo(1);
        assertThat(queue.visibleBodies()).containsExactly("d1");
    }

    @Test
    @DisplayName("큐에 넣은 뒤 표시하기 전에 다른 쪽이 선점한 건은 건너뛴 것으로 센다")
    void countsClaimedMeanwhileAsSkipped() {
        store.insertDeliveries(List.of(PushDelivery.pending("d1", "p1", "s1", NOW)));
        var racing = new PushQueue() {
            @Override public List<String> send(List<String> deliveryIds) {
                deliveryIds.forEach(id -> store.claimQueuedDelivery(id, NOW, NOW.plusSeconds(120)));
                return List.of();
            }
            @Override public List<Message> receive(int max, Duration wait) { return List.of(); }
            @Override public void delete(Message message) { }
        };
        var cycle = new PushRelay(store, racing, settings, QUEUE_LEASE, clock, metrics).relay();
        assertThat(cycle.skipped()).isEqualTo(1);
        assertThat(cycle.queued()).isZero();
        assertThat(store.findDelivery("d1").orElseThrow().status()).isEqualTo(PushDelivery.Status.SENDING);
    }

    @Test
    @DisplayName("한 주기에 넣는 건수는 설정한 상한을 넘지 않고 큐에는 10건씩 나눠 넣는다")
    void respectsMaxPerCycleAndBatchesOfTen() {
        for (var index = 0; index < 60; index++) { store.insertDeliveries(List.of(PushDelivery.pending("d" + index, "p1", "s" + index, NOW))); }
        var sizes = new java.util.ArrayList<Integer>();
        var counting = new PushQueue() {
            @Override public List<String> send(List<String> deliveryIds) { sizes.add(deliveryIds.size()); return List.of(); }
            @Override public List<Message> receive(int max, Duration wait) { return List.of(); }
            @Override public void delete(Message message) { }
        };
        var narrow = new PushSettings(Duration.ofSeconds(60), 20, 8, Duration.ofSeconds(120), Duration.ofSeconds(10), 25, 50, Set.of("fcm.googleapis.com"));
        var cycle = new PushRelay(store, counting, narrow, QUEUE_LEASE, clock, metrics).relay();
        assertThat(cycle.queued()).isEqualTo(50);
        assertThat(sizes).containsExactly(10, 10, 5, 10, 10, 5);
        assertThat(store.countDeliveries(PushDelivery.Status.PENDING)).isEqualTo(10);
    }

    @Test
    @DisplayName("주기 시간, 넣은 건수와 실패 건수, 릴레이 지연, 큐 대기 백로그를 지표로 낸다")
    void recordsMetrics() {
        store.insertDeliveries(List.of(PushDelivery.pending("d1", "p1", "s1", NOW.minusSeconds(30)), PushDelivery.pending("d2", "p1", "s2", NOW),
            PushDelivery.pending("later", "p1", "s3", NOW.plusSeconds(3600))));
        queue.reject("d2");
        relay.relay();
        assertThat(meters.get("career.form.push.dispatch.cycle").timer().count()).isEqualTo(1);
        assertThat(meters.get("career.form.push.relay.enqueued").tag("result", "queued").counter().count()).isEqualTo(1);
        assertThat(meters.get("career.form.push.relay.enqueued").tag("result", "failed").counter().count()).isEqualTo(1);
        assertThat(meters.get("career.form.push.relay.delay").timer().count()).isEqualTo(1);
        assertThat(meters.get("career.form.push.relay.delay").timer().totalTime(java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(30);
        assertThat(meters.get("career.form.push.backlog").tag("status", "queued").gauge().value()).isEqualTo(1);
        assertThat(meters.get("career.form.push.backlog").tag("status", "pending").gauge().value()).isEqualTo(2);
        assertThat(meters.get("career.form.push.backlog").tag("status", "sending").gauge().value()).isZero();
    }
}
