package com.careerform.notification;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.careerform.monitoring.ExternalCallMetrics;

/**
 * 한 주기: 예정 시각이 지난 대기 건과 리스가 만료된 발송 중 건을 찾아 조건부 갱신으로 선점한 뒤,
 * 동시성 한도 안에서 Web Push를 보내고 재시도 표에 따라 상태를 바꾼다. 로그에는 발송 ID·공고 ID·응답 코드·소요 시간만 남긴다.
 */
public final class PushDispatcher implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(PushDispatcher.class);
    private final NotificationStore store;
    private final WebPushClient client;
    private final RetryPolicy policy;
    private final PushSettings settings;
    private final Clock clock;
    private final Executor executor;
    private final ExecutorService owned;
    private final PushDispatchMetrics metrics;

    public PushDispatcher(NotificationStore store, WebPushClient client, RetryPolicy policy, PushSettings settings, Clock clock, Executor executor,
                          PushDispatchMetrics metrics) {
        this(store, client, policy, settings, clock, executor, null, metrics);
    }

    private PushDispatcher(NotificationStore store, WebPushClient client, RetryPolicy policy, PushSettings settings, Clock clock, Executor executor,
                           ExecutorService owned, PushDispatchMetrics metrics) {
        this.store = store;
        this.client = client;
        this.policy = policy;
        this.settings = settings;
        this.clock = clock;
        this.executor = executor;
        this.owned = owned;
        this.metrics = metrics;
    }

    /** 가상 스레드 실행기를 직접 소유하는 운영용 발송기. close()가 실행기를 닫는다. */
    public static PushDispatcher withVirtualThreads(NotificationStore store, WebPushClient client, RetryPolicy policy, PushSettings settings, Clock clock,
                                                    PushDispatchMetrics metrics) {
        var executor = Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("push-dispatch-", 0).factory());
        return new PushDispatcher(store, client, policy, settings, clock, executor, executor, metrics);
    }

    public record Cycle(int due, int claimed, int accepted, int retried, int abandoned, int skipped, int stale, Duration duration) { }

    public Cycle dispatch() {
        var started = System.nanoTime();
        var now = clock.instant();
        var counters = new Counters();
        var processed = new HashSet<String>();
        var postings = new ConcurrentHashMap<String, Optional<JobPosting>>();
        var inFlight = new Semaphore(settings.concurrency());
        var futures = new ArrayList<CompletableFuture<Void>>();
        var interrupted = false;
        while (!interrupted && processed.size() < settings.maxPerCycle()) {
            var due = store.findDueDeliveries(now, settings.batchSize()).stream().filter(delivery -> !processed.contains(delivery.id())).toList();
            if (due.isEmpty()) { break; }
            for (var observed : due) {
                processed.add(observed.id());
                counters.due.incrementAndGet();
                var claimed = store.claimDelivery(observed, now, now.plus(settings.lease()));
                if (claimed.isEmpty()) { counters.skipped.incrementAndGet(); continue; }
                counters.claimed.incrementAndGet();
                try {
                    inFlight.acquire();
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    interrupted = true;
                    break;
                }
                var delivery = claimed.get();
                futures.add(CompletableFuture.runAsync(() -> {
                    try { deliver(delivery, now, postings, counters); }
                    finally { inFlight.release(); }
                }, executor));
            }
        }
        for (var future : futures) { future.join(); }
        var cycle = counters.cycle(Duration.ofNanos(System.nanoTime() - started));
        metrics.cycle(cycle);
        log.info("PUSH_DISPATCH_CYCLE due={} claimed={} accepted={} retried={} abandoned={} skipped={} stale={} durationMs={}",
            cycle.due(), cycle.claimed(), cycle.accepted(), cycle.retried(), cycle.abandoned(), cycle.skipped(), cycle.stale(), cycle.duration().toMillis());
        return cycle;
    }

    @Override
    public void close() {
        if (owned != null) { owned.shutdownNow(); }
    }

    private void deliver(PushDelivery claimed, Instant now, Map<String, Optional<JobPosting>> postings, Counters counters) {
        try {
            var posting = postings.computeIfAbsent(claimed.postingId(), store::findPosting);
            if (posting.isEmpty()) { finish(claimed, claimed.abandoned(claimed.lastResponseCode(), "POSTING_MISSING"), counters, 0); return; }
            if (!now.isBefore(posting.get().closesAt())) { finish(claimed, claimed.abandoned(claimed.lastResponseCode(), "DEADLINE_PASSED"), counters, 0); return; }
            var subscription = store.findSubscription(claimed.subscriptionId());
            if (subscription.isEmpty()) { finish(claimed, claimed.abandoned(claimed.lastResponseCode(), "SUBSCRIPTION_MISSING"), counters, 0); return; }
            var payload = PushPayload.of(posting.get());
            var ttl = Duration.between(now, posting.get().closesAt());
            var callStarted = System.nanoTime();
            RetryPolicy.Decision decision;
            try {
                var response = client.send(subscription.get(), payload, ttl);
                decision = policy.onResponse(response, claimed.attempts(), clock.instant());
                metrics.send(sendOutcome(decision), System.nanoTime() - callStarted, response.statusCode() >= 400, false);
            } catch (IOException exception) {
                var timeout = ExternalCallMetrics.isTimeout(exception);
                decision = policy.onFailure(exception, claimed.attempts(), clock.instant());
                metrics.send(timeout ? "timeout" : "error", System.nanoTime() - callStarted, true, timeout);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                log.warn("PUSH_SEND_INTERRUPTED postingId={} deliveryId={} attempt={}", claimed.postingId(), claimed.id(), claimed.attempts());
                return;
            }
            apply(claimed, decision, counters, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - callStarted));
        } catch (RuntimeException exception) {
            var decision = policy.onFailure(exception, claimed.attempts(), clock.instant());
            log.warn("PUSH_DELIVERY_FAILED postingId={} deliveryId={} attempt={} failure={}", claimed.postingId(), claimed.id(), claimed.attempts(),
                exception.getClass().getSimpleName());
            apply(claimed, decision, counters, 0);
        }
    }

    private void apply(PushDelivery claimed, RetryPolicy.Decision decision, Counters counters, long durationMs) {
        switch (decision) {
            case RetryPolicy.Accepted accepted -> finish(claimed, claimed.accepted(accepted.statusCode()), counters, durationMs);
            case RetryPolicy.Retry retry -> finish(claimed, claimed.retry(retry.nextAttemptAt(), retry.statusCode(), retry.reason()), counters, durationMs);
            case RetryPolicy.Abandon abandon -> {
                if (abandon.removeSubscription()) { store.deleteSubscription(claimed.subscriptionId()); }
                if ("INVALID_REQUEST".equals(abandon.reason())) {
                    log.warn("PUSH_INVALID_REQUEST postingId={} deliveryId={} attempt={} responseCode={}", claimed.postingId(), claimed.id(),
                        claimed.attempts(), abandon.statusCode());
                }
                finish(claimed, claimed.abandoned(abandon.statusCode(), abandon.reason()), counters, durationMs);
            }
        }
    }

    private void finish(PushDelivery claimed, PushDelivery next, Counters counters, long durationMs) {
        if (!store.completeDelivery(claimed, next)) {
            counters.stale.incrementAndGet();
            log.info("PUSH_RESULT_STALE postingId={} deliveryId={} attempt={}", claimed.postingId(), claimed.id(), claimed.attempts());
            return;
        }
        var outcome = switch (next.status()) {
            case ACCEPTED -> { counters.accepted.incrementAndGet(); yield "accepted"; }
            case PENDING -> { counters.retried.incrementAndGet(); yield "retry"; }
            case ABANDONED -> { counters.abandoned.incrementAndGet(); yield "abandoned"; }
            case SENDING -> throw new IllegalStateException("Delivery cannot finish as SENDING");
        };
        metrics.delivery(outcome, next.lastReason());
        log.info("PUSH_RESULT postingId={} deliveryId={} attempt={} outcome={} reason={} responseCode={} nextAttemptAt={} durationMs={}",
            next.postingId(), next.id(), next.attempts(), outcome, next.lastReason(), next.lastResponseCode(),
            next.status() == PushDelivery.Status.PENDING ? next.nextAttemptAt() : null, durationMs);
    }

    private static String sendOutcome(RetryPolicy.Decision decision) {
        return switch (decision) {
            case RetryPolicy.Accepted accepted -> "accepted";
            case RetryPolicy.Retry retry -> "RETRY_AFTER".equals(retry.reason()) ? "retry_after" : "failure";
            case RetryPolicy.Abandon abandon -> switch (abandon.reason()) {
                case "GONE" -> "gone";
                case "INVALID_REQUEST" -> "invalid";
                default -> "failure";
            };
        };
    }

    private static final class Counters {
        private final AtomicInteger due = new AtomicInteger();
        private final AtomicInteger claimed = new AtomicInteger();
        private final AtomicInteger accepted = new AtomicInteger();
        private final AtomicInteger retried = new AtomicInteger();
        private final AtomicInteger abandoned = new AtomicInteger();
        private final AtomicInteger skipped = new AtomicInteger();
        private final AtomicInteger stale = new AtomicInteger();

        private Cycle cycle(Duration duration) {
            return new Cycle(due.get(), claimed.get(), accepted.get(), retried.get(), abandoned.get(), skipped.get(), stale.get(), duration);
        }
    }

    static List<String> reasons() {
        return List.of("ACCEPTED", "RETRY_AFTER", "SERVER_ERROR", "TIMEOUT", "IO_ERROR", "UNEXPECTED_STATUS", "INTERNAL_ERROR", "GONE", "INVALID_REQUEST",
            "MAX_ATTEMPTS", "DEADLINE_PASSED", "SUBSCRIPTION_MISSING", "POSTING_MISSING");
    }
}
