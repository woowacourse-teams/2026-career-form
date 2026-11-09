package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoClients;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import tools.jackson.databind.ObjectMapper;

@EnabledIfEnvironmentVariable(named = "ANALYSIS_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+")
class AdmissionComparisonTest {
    @Test
    void recordsSameSyntheticNormalAndFloodScenariosAcrossThreePolicies() throws Exception {
        try (var client = MongoClients.create(System.getenv("ANALYSIS_TEST_MONGO_URI"))) {
            var records = new ArrayList<Map<String, Object>>();
            for (var policy : new String[] { "unlimited", "simple-api-minute-60", "designed" }) {
                var mongo = new MongoTemplate(client, "cf359_test_" + UUID.randomUUID().toString().replace("-", ""));
                var clock = new ScenarioClock();
                var settings = AdmissionSettings.defaults();
                var meters = new SimpleMeterRegistry();
                var gate = new ExecutionGate(settings.concurrency(), settings.waiting(), settings.queueWait());
                var control = new AiAdmission(new UsageLedger(new MongoUsageStore(mongo), clock, settings), gate, settings, meters);
                var normalCalls = new AtomicInteger();
                var api = new AtomicInteger();
                var completed = 0;
                var started = System.nanoTime();
                for (var job = 0; job < 12; job++) {
                    AnalysisContext.begin("synthetic-normal", settings.requestTimeout());
                    try {
                        for (var deterministic = 0; deterministic < 4; deterministic++) simpleCheck(policy, api);
                        for (var logical = 0; logical < 4; logical++) {
                            simpleCheck(policy, api);
                            var retry = logical == 0;
                            java.util.function.Supplier<String> operation = () -> {
                                if (retry) transmit(policy, control, normalCalls);
                                return transmit(policy, control, normalCalls);
                            };
                            if (policy.equals("designed")) control.logical(operation); else operation.get();
                        }
                        completed++;
                    } catch (AdmissionFailure rejected) {
                        assertThat(rejected.code()).isIn("SIMPLE_LIMIT", "INSTALL_LIMIT", "USER_LIMIT");
                    } finally { AnalysisContext.clear(); }
                }
                var normalNanos = System.nanoTime() - started;
                clock.now = clock.now.plusSeconds(60);
                api.set(0);
                var floodCalls = new AtomicInteger();
                for (var attempt = 0; attempt < 180; attempt++) {
                    AnalysisContext.begin("synthetic-flood", settings.requestTimeout());
                    try {
                        simpleCheck(policy, api);
                        if (policy.equals("designed")) control.logical(() -> transmit(policy, control, floodCalls));
                        else transmit(policy, control, floodCalls);
                    } catch (AdmissionFailure rejected) {
                        assertThat(rejected.code()).isIn("SIMPLE_LIMIT", "INSTALL_LIMIT", "USER_LIMIT");
                    } finally { AnalysisContext.clear(); }
                }
                var row = new LinkedHashMap<String, Object>();
                row.put("policy", policy);
                row.put("normalJobs", 12);
                row.put("normalCompleted", completed);
                row.put("normalExternalAttempts", normalCalls.get());
                row.put("normalElapsedNanos", normalNanos);
                row.put("floodRequests", 180);
                row.put("floodExternalAttempts", floodCalls.get());
                row.put("queueWaitNanos", meters.timer("analysis.admission.queue.wait").totalTime(java.util.concurrent.TimeUnit.NANOSECONDS));
                records.add(row);
            }
            assertThat(records.get(0).get("normalCompleted")).isEqualTo(12);
            assertThat(records.get(1).get("normalCompleted")).isEqualTo(7);
            assertThat(records.get(2).get("normalCompleted")).isEqualTo(12);
            assertThat(records.get(0).get("floodExternalAttempts")).isEqualTo(180);
            assertThat(records.get(2).get("floodExternalAttempts")).isEqualTo(60);
            var target = Path.of("build/reports/admission-comparison.json");
            Files.createDirectories(target.getParent());
            Files.writeString(target, new ObjectMapper().writeValueAsString(Map.of(
                "scenario", "synthetic-12-jobs-4-policy-4-ai-1-internal-retry-and-180-flood",
                "limitations", "Sequential admission-component experiment with real local Mongo and synthetic provider. Not observed product traffic, real latency, billing, or concurrency capacity evidence.",
                "results", records)));
        }
    }

    private static void simpleCheck(String policy, AtomicInteger api) {
        if (policy.startsWith("simple") && api.incrementAndGet() > 60) throw new AdmissionFailure("SIMPLE_LIMIT", 429, null);
    }
    private static String transmit(String policy, AiAdmission control, AtomicInteger external) {
        java.util.function.Supplier<String> provider = () -> { external.incrementAndGet(); return "synthetic"; };
        return policy.equals("designed") ? control.transmit(provider) : provider.get();
    }
    private static final class ScenarioClock extends Clock {
        private Instant now = Instant.parse("2030-01-01T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
}
