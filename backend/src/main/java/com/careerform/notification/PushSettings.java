package com.careerform.notification;

import java.time.Duration;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/** 발송기 설정. 주기는 시연용 10초부터 1시간까지, 리스는 호출 시간 초과보다 길어야 한다. */
public record PushSettings(
    Duration dispatchInterval,
    int concurrency,
    int maxAttempts,
    Duration lease,
    Duration timeout,
    int batchSize,
    int maxPerCycle,
    Set<String> allowedEndpointHosts
) {
    public PushSettings {
        Objects.requireNonNull(dispatchInterval);
        Objects.requireNonNull(lease);
        Objects.requireNonNull(timeout);
        Objects.requireNonNull(allowedEndpointHosts);
        if (dispatchInterval.compareTo(Duration.ofSeconds(10)) < 0 || dispatchInterval.compareTo(Duration.ofHours(1)) > 0) {
            throw new IllegalArgumentException("Invalid push dispatch interval");
        }
        if (concurrency < 1 || concurrency > 200) { throw new IllegalArgumentException("Invalid push concurrency"); }
        if (maxAttempts < 1 || maxAttempts > 20) { throw new IllegalArgumentException("Invalid push max attempts"); }
        if (timeout.compareTo(Duration.ofSeconds(1)) < 0 || timeout.compareTo(Duration.ofSeconds(60)) > 0) { throw new IllegalArgumentException("Invalid push timeout"); }
        if (lease.compareTo(timeout) <= 0 || lease.compareTo(Duration.ofHours(1)) > 0) { throw new IllegalArgumentException("Invalid push lease"); }
        if (batchSize < 1 || batchSize > 5000) { throw new IllegalArgumentException("Invalid push batch size"); }
        if (maxPerCycle < batchSize || maxPerCycle > 1_000_000) { throw new IllegalArgumentException("Invalid push max per cycle"); }
        allowedEndpointHosts = allowedEndpointHosts.stream().filter(Objects::nonNull).map(host -> host.strip().toLowerCase(Locale.ROOT))
            .filter(host -> !host.isEmpty()).collect(Collectors.toUnmodifiableSet());
        if (allowedEndpointHosts.isEmpty()) { throw new IllegalArgumentException("Allowed push endpoint hosts are required"); }
    }

    public static PushSettings defaults() {
        return new PushSettings(Duration.ofSeconds(60), 20, 8, Duration.ofSeconds(120), Duration.ofSeconds(10), 500, 20000, Set.of("fcm.googleapis.com"));
    }

    public PushSettings withDispatchInterval(Duration value) {
        return new PushSettings(value, concurrency, maxAttempts, lease, timeout, batchSize, maxPerCycle, allowedEndpointHosts);
    }
}
