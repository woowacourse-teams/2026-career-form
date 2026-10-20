package com.careerform.quality;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

public final class QualityTaskQueue implements AutoCloseable {
    private final ScheduledThreadPoolExecutor worker;
    private final Set<Job> admitted = new HashSet<>();
    private final int capacity;
    private final long byteCapacity;
    private final long eventCapacity;
    private final Duration lifetime;
    private final Clock clock;
    private final MeterRegistry meters;
    private long bytes;
    private int active;
    private boolean closed;

    public QualityTaskQueue(int capacity, long byteCapacity, long eventCapacity, Duration lifetime, Clock clock, MeterRegistry meters) {
        if (capacity < 1 || byteCapacity < 1 || eventCapacity < 1 || lifetime.isNegative() || lifetime.isZero()) {
            throw new IllegalArgumentException("Invalid quality task limits");
        }
        this.capacity = capacity;
        this.byteCapacity = byteCapacity;
        this.eventCapacity = eventCapacity;
        this.lifetime = lifetime;
        this.clock = clock;
        this.meters = meters;
        worker = new ScheduledThreadPoolExecutor(1, task -> {
            var thread = new Thread(task, "quality-observation");
            thread.setDaemon(true);
            return thread;
        }, new ScheduledThreadPoolExecutor.AbortPolicy());
        worker.setRemoveOnCancelPolicy(true);
        worker.setExecuteExistingDelayedTasksAfterShutdownPolicy(false);
        meters.gauge("quality.tasks.retained.bytes", this, QualityTaskQueue::retainedBytes);
        meters.gauge("quality.tasks.active", this, QualityTaskQueue::active);
        meters.gauge("quality.tasks.waiting", this, QualityTaskQueue::waiting);
    }

    public synchronized boolean submit(long retainedBytes, Callable<Boolean> action) {
        if (closed || Thread.currentThread().isInterrupted() || retainedBytes < 0 || retainedBytes > eventCapacity
            || admitted.size() >= capacity || retainedBytes > byteCapacity - bytes) {
            outcome("rejected");
            return false;
        }
        var job = new Job(retainedBytes, action, clock.instant());
        admitted.add(job);
        bytes += retainedBytes;
        schedule(job, 0);
        return admitted.contains(job);
    }

    public synchronized long retainedBytes() { return bytes; }

    public synchronized int active() { return active; }

    public synchronized int waiting() { return admitted.size() - active; }

    private synchronized void schedule(Job job, long delay) {
        try { worker.schedule(() -> execute(job), delay, TimeUnit.MILLISECONDS); }
        catch (RejectedExecutionException exception) { finish(job, "rejected"); }
    }

    private void execute(Job job) {
        synchronized (this) {
            if (!admitted.contains(job)) { return; }
            if (closed || !clock.instant().isBefore(job.created.plus(lifetime))) {
                finish(job, closed ? "shutdown" : "expired");
                return;
            }
            if (!job.started) {
                meters.timer("quality.tasks.queue.wait").record(Duration.between(job.created, clock.instant()).abs());
                job.started = true;
            }
            job.running = true;
            active++;
        }
        var sample = Timer.start(meters);
        var completed = true;
        var result = "completed";
        try { completed = job.action.call(); }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); result = "interrupted"; }
        catch (Exception exception) { result = "failed"; }
        finally {
            sample.stop(meters.timer("quality.tasks.execution"));
            synchronized (this) {
                job.running = false;
                active--;
                if (completed || closed) { finish(job, closed ? "shutdown" : result); }
                else { schedule(job, 100); }
            }
        }
    }

    private synchronized void finish(Job job, String result) {
        if (admitted.remove(job)) {
            bytes -= job.bytes;
            outcome(result);
        }
    }

    private void outcome(String result) { meters.counter("quality.tasks", "outcome", result).increment(); }

    @Override
    public synchronized void close() {
        closed = true;
        worker.shutdownNow();
        for (var job : Set.copyOf(admitted)) {
            if (!job.running) { finish(job, "shutdown"); }
        }
    }

    private static final class Job {
        private final long bytes;
        private final Callable<Boolean> action;
        private final Instant created;
        private boolean started;
        private boolean running;

        private Job(long bytes, Callable<Boolean> action, Instant created) {
            this.bytes = bytes;
            this.action = action;
            this.created = created;
        }
    }
}
