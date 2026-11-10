package com.careerform.notification;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 한 주기: 예정 시각이 지난 대기 건과 리스가 만료된 발송 중 건을 찾아 조건부 갱신으로 선점한 뒤,
 * 동시성 한도 안에서 한 건씩 실행(PushDeliveryExecutor)에 맡긴다.
 */
public final class PushDispatcher implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(PushDispatcher.class);
    private final NotificationStore store;
    private final PushDeliveryExecutor deliveries;
    private final PushSettings settings;
    private final Clock clock;
    private final Executor executor;
    private final ExecutorService owned;
    private final PushDispatchMetrics metrics;

    public PushDispatcher(NotificationStore store, PushDeliveryExecutor deliveries, PushSettings settings, Clock clock, Executor executor,
                          PushDispatchMetrics metrics) {
        this(store, deliveries, settings, clock, executor, null, metrics);
    }

    private PushDispatcher(NotificationStore store, PushDeliveryExecutor deliveries, PushSettings settings, Clock clock, Executor executor,
                           ExecutorService owned, PushDispatchMetrics metrics) {
        this.store = store;
        this.deliveries = deliveries;
        this.settings = settings;
        this.clock = clock;
        this.executor = executor;
        this.owned = owned;
        this.metrics = metrics;
    }

    /** 가상 스레드 실행기를 직접 소유하는 운영용 발송기. close()가 실행기를 닫는다. */
    public static PushDispatcher withVirtualThreads(NotificationStore store, PushDeliveryExecutor deliveries, PushSettings settings, Clock clock,
                                                    PushDispatchMetrics metrics) {
        var executor = Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("push-dispatch-", 0).factory());
        return new PushDispatcher(store, deliveries, settings, clock, executor, executor, metrics);
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
                    try { counters.count(deliveries.execute(delivery, now, postings)); }
                    finally { inFlight.release(); }
                }, executor));
            }
        }
        for (var future : futures) { future.join(); }
        refreshGauges();
        var cycle = counters.cycle(Duration.ofNanos(System.nanoTime() - started));
        metrics.cycle(cycle);
        log.info("PUSH_DISPATCH_CYCLE due={} claimed={} accepted={} retried={} abandoned={} skipped={} stale={} durationMs={}",
            cycle.due(), cycle.claimed(), cycle.accepted(), cycle.retried(), cycle.abandoned(), cycle.skipped(), cycle.stale(), cycle.duration().toMillis());
        return cycle;
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

    @Override
    public void close() {
        if (owned != null) { owned.shutdownNow(); }
    }

    private static final class Counters {
        private final AtomicInteger due = new AtomicInteger();
        private final AtomicInteger claimed = new AtomicInteger();
        private final AtomicInteger accepted = new AtomicInteger();
        private final AtomicInteger retried = new AtomicInteger();
        private final AtomicInteger abandoned = new AtomicInteger();
        private final AtomicInteger skipped = new AtomicInteger();
        private final AtomicInteger stale = new AtomicInteger();

        private void count(PushDeliveryExecutor.Outcome outcome) {
            switch (outcome) {
                case ACCEPTED -> accepted.incrementAndGet();
                case RETRIED -> retried.incrementAndGet();
                case ABANDONED -> abandoned.incrementAndGet();
                case STALE -> stale.incrementAndGet();
                case INTERRUPTED -> { }
            }
        }

        private Cycle cycle(Duration duration) {
            return new Cycle(due.get(), claimed.get(), accepted.get(), retried.get(), abandoned.get(), skipped.get(), stale.get(), duration);
        }
    }

    static List<String> reasons() {
        return List.of("ACCEPTED", "RETRY_AFTER", "SERVER_ERROR", "TIMEOUT", "IO_ERROR", "UNEXPECTED_STATUS", "INTERNAL_ERROR", "GONE", "INVALID_REQUEST",
            "MAX_ATTEMPTS", "DEADLINE_PASSED", "SUBSCRIPTION_MISSING", "POSTING_MISSING", "FILTER_MISMATCH");
    }
}
