package com.careerform.admission;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("analysis_usage")
public record UsageBucket(@Id String id, long revision, int limit, int used, Map<String, Entry> entries,
                          Instant expiresAt, Instant recoverAt) {
    private static final int MAX_ENTRIES = 12000;
    public enum State { RESERVED, COMMITTED, RELEASED, EXPIRED }
    public record Entry(State state, Instant deadline) { }

    public UsageBucket {
        entries = Map.copyOf(entries);
        if (limit < 1 || used < 0 || used > limit || revision < 0 || entries.size() > MAX_ENTRIES) {
            throw new IllegalArgumentException("Invalid usage bucket");
        }
    }

    public static UsageBucket empty(String id, int limit, Instant expiresAt) {
        return new UsageBucket(id, 0, limit, 0, Map.of(), expiresAt, null);
    }

    public UsageBucket reserve(String operation, Instant deadline, Instant now) {
        if (entries.containsKey(operation)) return this;
        if (deadline != null && !now.isBefore(deadline)) throw new AdmissionFailure("ANALYSIS_DEADLINE", 503, null);
        if (used >= limit || entries.size() >= MAX_ENTRIES) throw new AdmissionFailure("BUCKET_EXHAUSTED", 429, null);
        var next = new LinkedHashMap<>(entries);
        next.put(operation, new Entry(State.RESERVED, deadline));
        return changed(used + 1, next);
    }

    public UsageBucket settle(String operation, boolean success, Instant now) {
        var entry = entries.get(operation);
        if (entry == null || entry.state() != State.RESERVED) return this;
        var expired = entry.deadline() != null && !now.isBefore(entry.deadline());
        var state = expired ? State.EXPIRED : success ? State.COMMITTED : State.RELEASED;
        var next = new LinkedHashMap<>(entries);
        next.put(operation, new Entry(state, entry.deadline()));
        return changed(used - (state == State.COMMITTED ? 0 : 1), next);
    }

    public UsageBucket cancelApproval(String operation) {
        var entry = entries.get(operation);
        if (entry == null || (entry.state() != State.RESERVED && entry.state() != State.COMMITTED)) return this;
        var next = new LinkedHashMap<>(entries);
        next.put(operation, new Entry(State.RELEASED, entry.deadline()));
        return changed(used - 1, next);
    }

    public UsageBucket expire(Instant now) {
        var current = this;
        for (var entry : entries.entrySet()) {
            if (entry.getValue().state() == State.RESERVED && entry.getValue().deadline() != null
                && !now.isBefore(entry.getValue().deadline())) {
                current = current.settle(entry.getKey(), false, now);
            }
        }
        return current;
    }

    public UsageBucket compactSlots(Instant now, int maximum) {
        var current = expire(now);
        var next = new LinkedHashMap<String, Entry>();
        current.entries.forEach((operation, entry) -> {
            if (entry.state() == State.RESERVED) next.put(operation, entry);
        });
        var cleaned = next.size() == current.entries.size() ? current : current.changed(next.size(), next);
        var adjusted = Math.max(cleaned.used(), maximum);
        return adjusted == cleaned.limit() ? cleaned : new UsageBucket(cleaned.id(), cleaned.revision() + 1,
            adjusted, cleaned.used(), cleaned.entries(), cleaned.expiresAt(), cleaned.recoverAt());
    }

    private UsageBucket changed(int count, Map<String, Entry> next) {
        var recover = next.values().stream().filter(entry -> entry.state() == State.RESERVED && entry.deadline() != null)
            .map(Entry::deadline).min(Instant::compareTo).orElse(null);
        return new UsageBucket(id, revision + 1, limit, count, next, expiresAt, recover);
    }

    @Override public String toString() { return "UsageBucket[redacted]"; }
}
