package com.careerform.monitoring.mongo;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

public final class MongoMetrics {

    private final MeterRegistry registry;

    public MongoMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    public MeterRegistry registry() {
        return registry;
    }

    public void record(String kind, String dimension, String value, String outcome, long nanos) {
        Timer.builder("career.form.mongo." + kind)
            .tags(dimension, value, "outcome", outcome)
            .publishPercentileHistogram()
            .minimumExpectedValue(Duration.ofMillis(1))
            .maximumExpectedValue(Duration.ofSeconds(60))
            .serviceLevelObjectives(Duration.ofMillis(100), Duration.ofMillis(500), Duration.ofSeconds(2))
            .register(registry).record(Math.max(0, nanos), TimeUnit.NANOSECONDS);
    }
}
