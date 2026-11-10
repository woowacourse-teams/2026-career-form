package com.careerform.notification;

import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * SQS 방식의 워커. 큐에서 발송 ID를 받아 조건부 갱신으로 선점한 건만 한 건씩 실행(PushDeliveryExecutor)에 맡기고, 처리가 끝나면 메시지를 지운다.
 * 같은 ID가 두 번 와도 선점은 한 번만 성공한다. 동시 발송 수는 concurrency를 넘지 않으며 받는 건수도 남은 한도에 맞춘다.
 * 재시도는 발송 문서의 다음 시도 시각으로 남고 릴레이가 때가 되면 다시 넣는다.
 */
public final class PushWorker implements AutoCloseable {
    /** 받기 호출은 인터럽트로 끊기지 않을 수 있다. 종료 유예(30초) 안에 받기와 진행 중인 발송이 모두 끝나도록 SQS 상한(20초)보다 짧게 둔다. */
    static final Duration LONG_POLL = Duration.ofSeconds(10);
    private static final Duration CLOSE_GRACE = Duration.ofSeconds(25);
    private static final Duration POLLER_JOIN = Duration.ofSeconds(3);
    private static final Duration FAILURE_PAUSE = Duration.ofSeconds(1);
    private static final Pattern DELIVERY_ID = Pattern.compile("[0-9a-f]{32}");
    private static final Logger log = LoggerFactory.getLogger(PushWorker.class);
    private final NotificationStore store;
    private final PushQueue queue;
    private final PushDeliveryExecutor deliveries;
    private final PushSettings settings;
    private final Clock clock;
    private final Executor executor;
    private final ExecutorService owned;
    private final PushDispatchMetrics metrics;
    private final Semaphore permits;
    private volatile boolean running;
    private volatile boolean closed;
    private Thread poller;

    public PushWorker(NotificationStore store, PushQueue queue, PushDeliveryExecutor deliveries, PushSettings settings, Clock clock, Executor executor,
                      PushDispatchMetrics metrics) {
        this(store, queue, deliveries, settings, clock, executor, null, metrics);
    }

    private PushWorker(NotificationStore store, PushQueue queue, PushDeliveryExecutor deliveries, PushSettings settings, Clock clock, Executor executor,
                       ExecutorService owned, PushDispatchMetrics metrics) {
        this.store = store;
        this.queue = queue;
        this.deliveries = deliveries;
        this.settings = settings;
        this.clock = clock;
        this.executor = executor;
        this.owned = owned;
        this.metrics = metrics;
        this.permits = new Semaphore(settings.concurrency());
    }

    /** 가상 스레드 실행기를 직접 소유하는 운영용 워커. close()가 실행기를 닫는다. */
    public static PushWorker withVirtualThreads(NotificationStore store, PushQueue queue, PushDeliveryExecutor deliveries, PushSettings settings,
                                                Clock clock, PushDispatchMetrics metrics) {
        var executor = Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("push-worker-", 0).factory());
        return new PushWorker(store, queue, deliveries, settings, clock, executor, executor, metrics);
    }

    /** 받기 루프를 시작한다. 이미 시작했으면 아무 일도 하지 않는다. */
    public synchronized void start() {
        if (poller != null) { return; }
        running = true;
        poller = Thread.ofPlatform().name("push-worker-poll").daemon(true)
            .uncaughtExceptionHandler((thread, failure) -> log.error("PUSH_WORKER_POLLER_DIED failure={}", failure.getClass().getSimpleName()))
            .start(this::loop);
        log.info("PUSH_WORKER_STARTED concurrency={}", settings.concurrency());
    }

    private void loop() {
        while (running) {
            try {
                poll(LONG_POLL);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return;
            } catch (RuntimeException exception) {
                if (!running) { return; }
                log.warn("PUSH_WORKER_POLL_FAILED failure={}", exception.getClass().getSimpleName());
                try {
                    Thread.sleep(FAILURE_PAUSE);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    /** 남은 동시 발송 수만큼(최대 10건) 받아 실행기에 맡기고 받은 건수를 돌려준다. 한도가 다 찼으면 자리가 날 때까지 기다린다. */
    int poll(Duration wait) throws InterruptedException {
        permits.acquire();
        var acquired = 1;
        while (acquired < PushQueue.MAX_BATCH && permits.tryAcquire()) { acquired++; }
        var handed = 0;
        try {
            var messages = queue.receive(acquired, wait);
            // 닫는 동안 돌아온 메시지는 보내기 시작하지 않는다. 지우지 않았으므로 가시성 타임아웃 뒤 다시 받는다.
            if (closed) { return 0; }
            var postings = new ConcurrentHashMap<String, Optional<JobPosting>>();
            for (var message : messages) {
                executor.execute(() -> handle(message, postings));
                handed++;
            }
            return messages.size();
        } catch (RejectedExecutionException exception) {
            log.warn("PUSH_WORKER_REJECTED");
            return handed;
        } finally {
            permits.release(acquired - handed);
        }
    }

    /** 한 건 처리. 발송이 끝나 자리를 돌려준 뒤에 메시지를 지워 큐 호출이 동시 발송 한도를 잡아먹지 않게 한다. */
    private void handle(PushQueue.Message message, Map<String, Optional<JobPosting>> postings) {
        var delete = false;
        try {
            delete = process(message, postings);
        } catch (RuntimeException exception) {
            metrics.workerMessage("failed");
            log.warn("PUSH_WORKER_FAILED failure={}", exception.getClass().getSimpleName());
        } finally {
            permits.release();
        }
        if (!delete) { return; }
        try {
            queue.delete(message);
        } catch (RuntimeException exception) {
            log.warn("PUSH_WORKER_DELETE_FAILED failure={}", exception.getClass().getSimpleName());
        }
    }

    /** 메시지를 지워도 되면 true. 형식이 깨진 메시지와 호출 도중 끊긴 건은 남긴다. */
    private boolean process(PushQueue.Message message, Map<String, Optional<JobPosting>> postings) {
        var id = message.body();
        if (id == null || !DELIVERY_ID.matcher(id).matches()) {
            metrics.workerMessage("invalid");
            log.warn("PUSH_WORKER_MESSAGE_INVALID length={}", id == null ? 0 : id.length());
            return false;
        }
        var now = clock.instant();
        var claimed = store.claimQueuedDelivery(id, now, now.plus(settings.lease()));
        if (claimed.isEmpty()) {
            metrics.workerMessage("skipped");
            return true;
        }
        if (message.sentAt() != null) { metrics.queueWait(Duration.between(message.sentAt(), now)); }
        var outcome = deliveries.execute(claimed.get(), now, postings);
        metrics.workerMessage(outcome == PushDeliveryExecutor.Outcome.INTERRUPTED ? "interrupted" : "processed");
        return outcome != PushDeliveryExecutor.Outcome.INTERRUPTED;
    }

    /**
     * 받기를 멈추고 진행 중인 건이 끝나기를 종료 유예 안에서 기다린다. 받기 호출이 인터럽트로 끊기지 않으면 그 호출이 돌아올 때까지(최대 long polling 시간)
     * 자리를 쥐고 있으므로 함께 기다린다. 남은 건은 리스가 지난 뒤 릴레이가 다시 넣는다. 닫은 워커는 다시 시작하지 않는다.
     */
    @Override
    public void close() {
        Thread stopping;
        synchronized (this) {
            closed = true;
            running = false;
            stopping = poller;
            poller = null;
        }
        try {
            if (stopping != null) {
                stopping.interrupt();
                stopping.join(POLLER_JOIN);
            }
            if (permits.tryAcquire(settings.concurrency(), CLOSE_GRACE.toMillis(), TimeUnit.MILLISECONDS)) {
                permits.release(settings.concurrency());
            } else {
                log.warn("PUSH_WORKER_CLOSE_TIMEOUT inFlight={}", settings.concurrency() - permits.availablePermits());
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
        if (owned != null) { owned.shutdownNow(); }
    }
}
