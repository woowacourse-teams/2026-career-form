package com.careerform.monitoring.mongo;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.junit.jupiter.api.Test;

class MongoMetricsTest {

    @Test
    void exportsHistogramBucketsAndZeroFailureBaselineWithEnvironmentTags() {
        var registry = new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
        try {
            registry.config().commonTags("env", "prod");
            var metrics = new MongoMetrics(registry);
            metrics.initialize("command", "command", "find", "success", "failure");
            metrics.record("command", "command", "find", "success", 150_000_000);

            var exported = registry.scrape();
            assertThat(exported).contains("career_form_mongo_command_seconds_bucket{");
            assertBucket(exported, "0.1", 0);
            assertBucket(exported, "0.2", 1);
            assertThat(exported).contains("career_form_mongo_command_seconds_count{command=\"find\",env=\"prod\",outcome=\"failure\"} 0");
        } finally {
            registry.close();
        }
    }

    private void assertBucket(String exported, String upperBound, long count) {
        var bucket = exported.lines().filter(line -> line.startsWith("career_form_mongo_command_seconds_bucket{")
            && line.contains("command=\"find\"") && line.contains("env=\"prod\"")
            && line.contains("outcome=\"success\"") && line.contains("le=\"" + upperBound + "\""))
            .findFirst().orElseThrow();
        assertThat(bucket).endsWith("} " + count);
    }
}
