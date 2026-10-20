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
    private static final long CAPTURE_RESERVATION_MULTIPLIER = 16;
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

    public boolean submit(long retainedBytes, Callable<Boolean> action) {
        return submit(retainedBytes, retainedBytes, action);
    }

    public synchronized boolean submit(long retainedBytes, long eventBytes, Callable<Boolean> action) {
        if (closed || Thread.currentThread().isInterrupted() || retainedBytes < 0 || eventBytes < 0 || eventBytes > eventCapacity
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

    public record Prepared(long bytes, Callable<Boolean> action) { }

    public boolean submitCaptured(java.util.function.Supplier<Prepared> capture) {
        return submitCaptured(limit -> capture.get());
    }

    public boolean submitCaptured(java.util.function.Function<Long, Prepared> capture) {
        var reservation = eventCapacity > byteCapacity / CAPTURE_RESERVATION_MULTIPLIER
            ? byteCapacity : eventCapacity * CAPTURE_RESERVATION_MULTIPLIER;
        Job job;
        synchronized (this) {
            if (closed || Thread.currentThread().isInterrupted() || admitted.size() >= capacity || reservation > byteCapacity - bytes) {
                outcome("rejected");
                return false;
            }
            job = new Job(reservation, null, clock.instant());
            job.preparing = true;
            admitted.add(job);
            bytes += reservation;
        }
        try {
            var prepared = capture.apply(job.bytes);
            synchronized (this) {
                job.preparing = false;
                if (closed || prepared == null || prepared.action() == null || prepared.bytes() < 0 || prepared.bytes() > job.bytes) {
                    finish(job, closed ? "shutdown" : "rejected");
                    return false;
                }
                bytes -= job.bytes - prepared.bytes();
                job.bytes = prepared.bytes();
                job.action = prepared.action();
                job.readyAt = clock.instant();
                schedule(job, 0);
                return admitted.contains(job);
            }
        } catch (RuntimeException exception) {
            synchronized (this) { job.preparing = false; finish(job, "rejected"); }
            return false;
        } catch (Error error) {
            synchronized (this) { job.preparing = false; finish(job, "failed"); }
            throw error;
        }
    }

    public void requireEventSize(long eventBytes) {
        if (eventBytes < 0 || eventBytes > eventCapacity) { throw new QualityAdmissionException(413); }
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
                meters.timer("quality.tasks.queue.wait").record(Duration.between(job.readyAt, clock.instant()).abs());
                job.started = true;
            }
            job.running = true;
            active++;
        }
        var sample = Timer.start(meters);
        var completed = true;
        var result = "completed";
        try { completed = job.action.call(); }
        catch (QualityAdmissionException exception) { result = "rejected"; }
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
            if (!job.running && !job.preparing) { finish(job, "shutdown"); }
        }
    }

    private static final class Job {
        private long bytes;
        private Callable<Boolean> action;
        private final Instant created;
        private Instant readyAt;
        private boolean preparing;
        private boolean started;
        private boolean running;

        private Job(long bytes, Callable<Boolean> action, Instant created) {
            this.bytes = bytes;
            this.action = action;
            this.created = created;
            this.readyAt = created;
        }
    }
}
