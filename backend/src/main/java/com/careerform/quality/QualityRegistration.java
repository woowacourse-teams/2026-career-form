package com.careerform.quality;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import io.micrometer.core.instrument.MeterRegistry;

public final class QualityRegistration {
    private final Map<String, Context> connections = new LinkedHashMap<>();
    private final Map<String, Context> runs = new LinkedHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final int capacity;
    private final Clock clock;
    private final MeterRegistry meters;

    public QualityRegistration(int capacity, Clock clock, MeterRegistry meters) {
        if (capacity < 1) { throw new IllegalArgumentException("Invalid quality registration capacity"); }
        this.capacity = capacity;
        this.clock = clock;
        this.meters = meters;
        meters.gauge("quality.registrations", this, registration -> registration.size());
    }

    public record Input(String clientRun, String key) {
        @Override public String toString() { return "Input[redacted]"; }
    }

    public record Credentials(String runId, String token, Instant expiresAt) {
        @Override public String toString() { return "Credentials[redacted]"; }
    }

    public record Context(String connection, String runId, String tokenHash, Instant createdAt, Set<String> events, boolean persisted, Set<String> snapshots) {
        public Context { events = Set.copyOf(events); snapshots = Set.copyOf(snapshots); }
        @Override public String toString() { return "Context[redacted]"; }
    }

    public synchronized Credentials register(Input input, Function<Context, Boolean> admit) {
        if (input == null) { reject(400); }
        var connection = connection(input.clientRun(), input.key());
        expire();
        if (connections.containsKey(connection)) { reject(409); }
        if (runs.size() >= capacity) { reject(429); }
        var bytes = new byte[32];
        random.nextBytes(bytes);
        var now = clock.instant();
        var credentials = new Credentials(UUID.randomUUID().toString().replace("-", ""), HexFormat.of().formatHex(bytes), now.plusSeconds(86400));
        var context = new Context(connection, credentials.runId(), QualityProjection.digest(credentials.token()), now, Set.of(), false, Set.of());
        connections.put(connection, context);
        runs.put(context.runId(), context);
        if (!Boolean.TRUE.equals(admit.apply(context))) {
            connections.remove(connection);
            runs.remove(context.runId());
            reject(429);
        }
        return credentials;
    }

    public String connection(String clientRun, String key) {
        if (clientRun == null || !clientRun.matches("[0-9a-f]{32}") || key == null || !key.matches("[0-9a-f]{64}")) { reject(400); }
        return QualityProjection.digest(clientRun + "|" + key);
    }

    public synchronized Context find(String connection) {
        expire();
        return connections.get(connection);
    }

    public synchronized void report(String runId, String token, String eventId, Function<Context, Boolean> admit) {
        expire();
        var context = runs.get(runId);
        if (context == null || token == null || !token.matches("[0-9a-f]{64}")
            || !MessageDigest.isEqual(context.tokenHash().getBytes(StandardCharsets.US_ASCII),
                QualityProjection.digest(token).getBytes(StandardCharsets.US_ASCII))) { reject(401); }
        var event = QualityProjection.digest(eventId);
        if (context.events().contains(event)) { return; }
        if (context.events().size() >= 200) { reject(400); }
        if (!Boolean.TRUE.equals(admit.apply(context))) { reject(429); }
        var next = new Context(context.connection(), context.runId(), context.tokenHash(), context.createdAt(),
            Stream.concat(context.events().stream(), Stream.of(event)).collect(Collectors.toUnmodifiableSet()), context.persisted(), context.snapshots());
        runs.put(runId, next);
        connections.put(next.connection(), next);
    }

    public synchronized void prepared(String connection, String snapshot) {
        expire();
        var context = connections.get(connection);
        if (context == null) { return; }
        var snapshots = snapshot == null ? context.snapshots() : Stream.concat(context.snapshots().stream(), Stream.of(snapshot))
            .collect(Collectors.toUnmodifiableSet());
        var next = new Context(context.connection(), context.runId(), context.tokenHash(), context.createdAt(), context.events(), true, snapshots);
        connections.put(connection, next);
        runs.put(next.runId(), next);
    }

    private synchronized int size() { expire(); return runs.size(); }

    private void expire() {
        var expired = runs.values().stream().filter(context -> !clock.instant().isBefore(context.createdAt().plusSeconds(86400))).toList();
        for (var context : expired) {
            runs.remove(context.runId());
            connections.remove(context.connection());
            meters.counter("quality.registration", "outcome", "expired").increment();
        }
    }

    private void reject(int status) {
        meters.counter("quality.registration", "outcome", Integer.toString(status)).increment();
        throw new QualityAdmissionException(status);
    }
}
