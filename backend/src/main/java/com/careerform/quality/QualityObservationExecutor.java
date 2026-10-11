package com.careerform.quality;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityObservationExecutor implements AutoCloseable {
    private static final long WAIT_MILLIS = 250;
    private static final QualityObservationExecutor SHARED = new QualityObservationExecutor();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(64), task -> {
            var thread = new Thread(task, "quality-observation");
            thread.setDaemon(true);
            return thread;
        }, new ThreadPoolExecutor.AbortPolicy());

    static QualityObservationExecutor shared() { return SHARED; }

    public <T> T observe(Callable<T> observation) {
        Future<T> pending = null;
        try {
            pending = workers.submit(observation);
            return pending.get(WAIT_MILLIS, TimeUnit.MILLISECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            LoggerFactory.getLogger(QualityObservationExecutor.class).warn("QUALITY_OBSERVATION_INTERRUPTED");
        } catch (ExecutionException | TimeoutException | RejectedExecutionException exception) {
            LoggerFactory.getLogger(QualityObservationExecutor.class).warn("QUALITY_OBSERVATION_UNAVAILABLE");
        } finally {
            if (pending != null && !pending.isDone()) {
                pending.cancel(true);
                workers.purge();
            }
        }
        return null;
    }

    @jakarta.annotation.PreDestroy
    @Override
    public void close() { workers.shutdownNow(); }
}
