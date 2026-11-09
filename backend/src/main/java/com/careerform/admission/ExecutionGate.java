package com.careerform.admission;

import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public final class ExecutionGate {
    private final Semaphore permits;
    private final AtomicInteger queued = new AtomicInteger();
    private final int concurrency;
    private final int queueCapacity;
    private final Duration wait;

    public ExecutionGate(int concurrency, int queueCapacity, Duration wait) {
        if (concurrency < 1 || queueCapacity < 0 || wait.isNegative() || wait.isZero()) throw new IllegalArgumentException("Invalid AI execution limits");
        this.concurrency = concurrency;
        this.permits = new Semaphore(concurrency, true);
        this.queueCapacity = queueCapacity;
        this.wait = wait;
    }

    public Permit acquire(long deadline) {
        check(deadline);
        try {
            if (permits.tryAcquire(0, TimeUnit.NANOSECONDS)) return granted(deadline);
            if (queued.incrementAndGet() > queueCapacity) {
                queued.decrementAndGet();
                throw new AdmissionFailure("AI_BUSY", 503, null);
            }
            try {
                var available = Math.min(wait.toNanos(), deadline - System.nanoTime());
                if (available <= 0 || !permits.tryAcquire(available, TimeUnit.NANOSECONDS)) {
                    throw new AdmissionFailure("AI_BUSY", 503, null);
                }
                return granted(deadline);
            } finally { queued.decrementAndGet(); }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AdmissionFailure("ANALYSIS_CANCELLED", 503, null);
        }
    }

    private Permit granted(long deadline) {
        try { check(deadline); return new Permit(); }
        catch (RuntimeException error) { permits.release(); throw error; }
    }

    private static void check(long deadline) {
        if (Thread.currentThread().isInterrupted() || deadline - System.nanoTime() <= 0) {
            throw new AdmissionFailure("ANALYSIS_DEADLINE", 503, null);
        }
    }

    public int active() { return concurrency - permits.availablePermits(); }
    public int waiting() { return queued.get(); }

    public final class Permit implements AutoCloseable {
        private final AtomicBoolean closed = new AtomicBoolean();
        public void close() { if (closed.compareAndSet(false, true)) permits.release(); }
    }
}
