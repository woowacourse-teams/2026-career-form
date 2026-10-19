package com.careerform.quality;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;

import io.micrometer.core.instrument.MeterRegistry;

public final class QualityDirtySources {
    private final Map<String, Entry> sources = new LinkedHashMap<>();
    private final AtomicBoolean flushing = new AtomicBoolean();
    private final int capacity;
    private final Duration lifetime;
    private final int attempts;
    private final Clock clock;
    private final MeterRegistry meters;
    private long generation;

    public QualityDirtySources(int capacity, Duration lifetime, int attempts, Clock clock, MeterRegistry meters) {
        if (capacity < 1 || attempts < 1 || lifetime.isZero() || lifetime.isNegative()) {
            throw new IllegalArgumentException("Invalid quality aggregate limits");
        }
        this.capacity = capacity;
        this.lifetime = lifetime;
        this.attempts = attempts;
        this.clock = clock;
        this.meters = meters;
        meters.gauge("quality.aggregate.pending", this, QualityDirtySources::size);
        meters.gauge("quality.aggregate.oldest.seconds", this, QualityDirtySources::oldestSeconds);
    }

    public synchronized boolean mark(QualityRecord source) {
        if (source.kind() != QualityRecord.Kind.REQUEST && source.kind() != QualityRecord.Kind.EXECUTION) { return false; }
        expire();
        var previous = sources.get(source.id());
        if (previous == null && sources.size() >= capacity) {
            outcome("rejected");
            return false;
        }
        sources.put(source.id(), new Entry(++generation, previous == null ? clock.instant() : previous.since(), 0));
        return true;
    }

    public void flush(int limit, Function<String, Boolean> aggregate) {
        if (limit < 1) { throw new IllegalArgumentException("Invalid quality aggregate batch size"); }
        if (!flushing.compareAndSet(false, true)) { return; }
        try {
            for (var candidate : candidates(limit)) {
                var success = false;
                try { success = Boolean.TRUE.equals(aggregate.apply(candidate.getKey())); }
                catch (RuntimeException exception) { outcome("failed"); }
                complete(candidate.getKey(), candidate.getValue(), success);
            }
        } finally { flushing.set(false); }
    }

    public synchronized int size() { return sources.size(); }

    public synchronized double oldestSeconds() {
        return sources.values().stream().map(Entry::since).min(Instant::compareTo)
            .map(since -> (double) Math.max(0, Duration.between(since, clock.instant()).getSeconds())).orElse(0.0);
    }

    private synchronized java.util.List<Map.Entry<String, Entry>> candidates(int limit) {
        expire();
        return sources.entrySet().stream().limit(limit).map(entry -> Map.entry(entry.getKey(), entry.getValue())).toList();
    }

    private synchronized void complete(String id, Entry attempted, boolean success) {
        var current = sources.get(id);
        if (current == null || current.generation() != attempted.generation()) { return; }
        if (success || attempted.failures() + 1 >= attempts) {
            sources.remove(id);
            outcome(success ? "completed" : "discarded");
        } else {
            sources.put(id, new Entry(current.generation(), current.since(), current.failures() + 1));
            outcome("retry");
        }
    }

    private void expire() {
        var expired = sources.entrySet().stream().filter(entry -> !clock.instant().isBefore(entry.getValue().since().plus(lifetime)))
            .map(Map.Entry::getKey).toList();
        for (var id : expired) { sources.remove(id); outcome("expired"); }
    }

    private void outcome(String result) { meters.counter("quality.aggregate", "outcome", result).increment(); }

    private record Entry(long generation, Instant since, int failures) { }
}
