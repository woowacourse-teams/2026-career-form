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
        timer(kind, dimension, value, outcome).record(Math.max(0, nanos), TimeUnit.NANOSECONDS);
    }

    public void initialize(String kind, String dimension, String value, String... outcomes) {
        for (var outcome : outcomes) {
            timer(kind, dimension, value, outcome);
        }
    }

    private Timer timer(String kind, String dimension, String value, String outcome) {
        return Timer.builder("career.form.mongo." + kind)
            .tags(dimension, value, "outcome", outcome)
            .minimumExpectedValue(Duration.ofMillis(1))
            .maximumExpectedValue(Duration.ofSeconds(60))
            .serviceLevelObjectives(Duration.ofMillis(1), Duration.ofMillis(5), Duration.ofMillis(10),
                Duration.ofMillis(50), Duration.ofMillis(100), Duration.ofMillis(200), Duration.ofMillis(500),
                Duration.ofSeconds(1), Duration.ofSeconds(2), Duration.ofSeconds(5), Duration.ofSeconds(10),
                Duration.ofSeconds(30), Duration.ofSeconds(60))
            .register(registry);
    }
}
