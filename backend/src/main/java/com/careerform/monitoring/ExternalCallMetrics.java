package com.careerform.monitoring;

import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
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

    public ExternalCallMetrics(MeterRegistry registry) {
        this.registry = registry;
        registry.counter("career.form.external.timeouts", "provider", "openai", "operation", "analysis");
        registry.counter("career.form.external.timeouts", "provider", "openai", "operation", "interaction");
        registry.counter("career.form.external.timeouts", "provider", "jev", "operation", "analysis");
    }

    public void record(String provider, String operation, long durationNanos, boolean failed, boolean timeout) {
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
