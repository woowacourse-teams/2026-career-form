package com.careerform.monitoring;

import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

@Component
public class ExternalCallMetrics {

    private static final Logger log = LoggerFactory.getLogger(ExternalCallMetrics.class);
    private final MeterRegistry registry;
    private final Optional<ExternalCallObserver> observer;

    public ExternalCallMetrics(MeterRegistry registry) {
        this(registry, Optional.empty());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public ExternalCallMetrics(MeterRegistry registry, Optional<ExternalCallObserver> observer) {
        this.registry = registry;
        this.observer = observer;
        registry.counter("career.form.external.timeouts", "provider", "openai", "operation", "analysis");
        registry.counter("career.form.external.timeouts", "provider", "openai", "operation", "interaction");
        registry.counter("career.form.external.timeouts", "provider", "jev", "operation", "analysis");
    }

    public void record(String provider, String operation, long durationNanos, boolean failed, boolean timeout) {
        record(provider, operation, durationNanos, failed, timeout, new ExternalCallObserver.Context(true, "UNKNOWN"));
    }

    public void record(String provider, String operation, long durationNanos, boolean failed, boolean timeout, ExternalCallObserver.Context context) {
        var outcome = timeout ? "timeout" : failed ? "failure" : "success";
        Timer.builder("career.form.external.call")
            .tags("provider", provider, "operation", operation, "outcome", outcome)
            .publishPercentileHistogram()
            .minimumExpectedValue(Duration.ofMillis(100))
            .maximumExpectedValue(Duration.ofSeconds(60))
            .serviceLevelObjectives(Duration.ofSeconds(5), Duration.ofSeconds(20))
            .register(registry)
            .record(Math.max(0, durationNanos), TimeUnit.NANOSECONDS);
        if (timeout) {
            registry.counter("career.form.external.timeouts", "provider", provider, "operation", operation).increment();
        }
        log.info("EXTERNAL_RESULT provider={} operation={} outcome={} durationMs={} requestId={}",
            provider, operation, outcome, TimeUnit.NANOSECONDS.toMillis(Math.max(0, durationNanos)), MDC.get("requestId"));
        try {
            observer.ifPresent(value -> value.recorded(provider, operation, outcome,
                TimeUnit.NANOSECONDS.toMillis(Math.max(0, durationNanos)), context));
        } catch (RuntimeException exception) {
            log.warn("QUALITY_EXTERNAL_OBSERVATION_UNAVAILABLE");
        }
    }

    public static String modelVersion(String model) {
        if (model == null || !model.matches("(?:gpt-[a-zA-Z0-9._-]{1,100}|o[1-9](?:-[a-zA-Z0-9._-]{1,100})?|jev-[a-zA-Z0-9._-]{1,100})")) { return "UNKNOWN"; }
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                .digest(model.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) { return "UNKNOWN"; }
    }

    public static boolean isTimeout(Throwable failure) {
        Set<Throwable> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        for (var current = failure; current != null && visited.add(current); current = current.getCause()) {
            if (current instanceof SocketTimeoutException || current instanceof HttpTimeoutException
                || current instanceof TimeoutException) {
                return true;
            }
        }
        return false;
    }
}
