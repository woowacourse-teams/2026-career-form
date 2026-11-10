package com.careerform.notification;

import java.time.Clock;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * SQS 방식의 릴레이. 한 주기: 예정 시각이 지난 대기 건, 큐 리스가 지난 큐 대기 건, 리스가 지난 발송 중 건의 ID를 큐에 넣고,
 * 넣은 건만 조건부 갱신으로 큐 대기로 표시한다. 큐에 먼저 넣으므로 표시 전에 멈춰도 메시지는 남고, 다시 넣은 중복은 워커의 선점이 거른다.
 */
public final class PushRelay {
    private static final Logger log = LoggerFactory.getLogger(PushRelay.class);
    private final NotificationStore store;
    private final PushQueue queue;
    private final PushSettings settings;
    private final Duration queueLease;
    private final Clock clock;
    private final PushDispatchMetrics metrics;

    public PushRelay(NotificationStore store, PushQueue queue, PushSettings settings, Duration queueLease, Clock clock, PushDispatchMetrics metrics) {
        this.store = store;
        this.queue = queue;
        this.settings = settings;
        this.queueLease = queueLease;
        this.clock = clock;
        this.metrics = metrics;
    }

    /** due는 찾은 건, queued는 큐 대기로 표시한 건, failed는 큐에 넣지 못한 건, skipped는 넣었지만 그 사이 다른 쪽이 선점한 건이다. */
    public record Cycle(int due, int queued, int failed, int skipped, Duration duration) { }

    public Cycle relay() {
        var started = System.nanoTime();
        var now = clock.instant();
        var leaseUntil = now.plus(queueLease);
        var processed = new HashSet<String>();
        var due = 0;
        var queued = 0;
        var failed = 0;
        var skipped = 0;
        while (processed.size() < settings.maxPerCycle()) {
            var found = store.findDueDeliveries(now, settings.batchSize()).stream().filter(delivery -> !processed.contains(delivery.id())).toList();
            if (found.isEmpty()) { break; }
            for (var from = 0; from < found.size(); from += PushQueue.MAX_BATCH) {
                var chunk = found.subList(from, Math.min(from + PushQueue.MAX_BATCH, found.size()));
                var ids = chunk.stream().map(PushDelivery::id).toList();
                processed.addAll(ids);
                due += chunk.size();
                var rejected = send(ids);
                for (var observed : chunk) {
                    if (rejected.contains(observed.id())) { failed++; continue; }
                    if (!store.markQueued(observed, leaseUntil)) { skipped++; continue; }
                    queued++;
                    if (observed.status() == PushDelivery.Status.PENDING) { metrics.relayDelay(Duration.between(observed.nextAttemptAt(), clock.instant())); }
                }
            }
        }
        refreshGauges();
        var cycle = new Cycle(due, queued, failed, skipped, Duration.ofNanos(System.nanoTime() - started));
        metrics.relay(cycle);
        log.info("PUSH_RELAY_CYCLE due={} queued={} failed={} skipped={} durationMs={}", cycle.due(), cycle.queued(), cycle.failed(), cycle.skipped(),
            cycle.duration().toMillis());
        return cycle;
    }

    /** 큐 호출이 예외로 끝나면 그 묶음 전체를 넣지 못한 것으로 본다. */
    private Set<String> send(List<String> ids) {
        try {
            return Set.copyOf(queue.send(ids));
        } catch (RuntimeException exception) {
            log.warn("PUSH_RELAY_SEND_FAILED failure={} count={}", exception.getClass().getSimpleName(), ids.size());
            return Set.copyOf(ids);
        }
    }

    private void refreshGauges() {
        try {
            metrics.backlog(store.countDeliveries(PushDelivery.Status.PENDING), store.countDeliveries(PushDelivery.Status.QUEUED),
                store.countDeliveries(PushDelivery.Status.SENDING));
            metrics.subscriptions(store.countSubscriptions());
        } catch (RuntimeException exception) {
            log.warn("PUSH_GAUGE_REFRESH_FAILED failure={}", exception.getClass().getSimpleName());
        }
    }
}
