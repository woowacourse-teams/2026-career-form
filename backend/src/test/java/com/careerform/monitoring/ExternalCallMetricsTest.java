package com.careerform.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.CompletionException;
import java.util.regex.Pattern;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.junit.jupiter.api.Test;

class ExternalCallMetricsTest {

    @Test
    void exportsFineGrainedLatencyBucketsAndPreservesExistingAlertCounts() {
        var registry = new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
        try {
            var metrics = new ExternalCallMetrics(registry);
            metrics.record("openai", "analysis", Duration.ofSeconds(3).toNanos(), false, false);
            metrics.record("openai", "analysis", Duration.ofSeconds(12).toNanos(), false, false);
            metrics.record("openai", "analysis", Duration.ofSeconds(25).toNanos(), false, false);
            var scrape = registry.scrape();
            var buckets = Pattern.compile("career_form_external_call_seconds_bucket\\{[^\\n]*le=\"([^\"]+)\"[^\\n]*} ([0-9.]+)")
                .matcher(scrape).results().toList();
            assertThat(buckets.stream().map(match -> match.group(1))
                .filter(value -> !value.equals("+Inf")).mapToDouble(Double::parseDouble)
                .filter(value -> value > 1 && value < 8).count()).isGreaterThan(3);
            assertThat(buckets.stream().filter(match -> match.group(1).equals("5.0"))
                .map(match -> Double.parseDouble(match.group(2)))).containsExactly(1.0);
            assertThat(buckets.stream().filter(match -> match.group(1).equals("20.0"))
                .map(match -> Double.parseDouble(match.group(2)))).containsExactly(2.0);
        } finally {
            registry.close();
        }
    }

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
