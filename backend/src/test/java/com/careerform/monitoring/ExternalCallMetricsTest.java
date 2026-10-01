package com.careerform.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.CompletionException;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class ExternalCallMetricsTest {

    @Test
    void recordsLatencyAndCountsOnlyTimeoutsSeparately() {
        var registry = new SimpleMeterRegistry();
        var metrics = new ExternalCallMetrics(registry);
        metrics.record("openai", "analysis", Duration.ofSeconds(21).toNanos(), false, false);
        metrics.record("openai", "analysis", Duration.ofSeconds(30).toNanos(), true, true);
        metrics.record("jev", "analysis", Duration.ofSeconds(1).toNanos(), true, false);

        assertThat(registry.get("career.form.external.call").tags("provider", "openai", "outcome", "success").timer().count())
            .isEqualTo(1);
        assertThat(registry.get("career.form.external.call").tags("provider", "openai", "outcome", "timeout").timer()
            .totalTime(java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(30);
        assertThat(registry.get("career.form.external.timeouts")
            .tags("provider", "openai", "operation", "analysis").counter().count()).isEqualTo(1);
        assertThat(registry.find("career.form.external.timeouts").tag("provider", "jev").counter().count()).isZero();
    }

    @Test
    void providesZeroBaselineBeforeTheFirstTimeoutForLowTrafficAlerts() {
        var registry = new SimpleMeterRegistry();
        new ExternalCallMetrics(registry);
        var counter = registry.find("career.form.external.timeouts")
            .tags("provider", "openai", "operation", "analysis").counter();
        assertThat(counter).isNotNull();
        assertThat(counter.count()).isZero();
    }

    @Test
    void recognizesWrappedTimeoutWithoutInspectingPrivateMessages() {
        var timeout = new CompletionException(new HttpTimeoutException("synthetic-private-message"));
        assertThat(ExternalCallMetrics.isTimeout(timeout)).isTrue();
        assertThat(ExternalCallMetrics.isTimeout(new IllegalStateException("timeout synthetic-private-message"))).isFalse();
    }
}
