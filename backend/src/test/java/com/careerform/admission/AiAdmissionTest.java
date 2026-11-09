package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoClients;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@EnabledIfEnvironmentVariable(named = "ANALYSIS_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+")
class AiAdmissionTest {
    @Test
    void retriesChargeUserOnceAndEveryActualTransmissionSeparately() {
        try (var client = MongoClients.create(System.getenv("ANALYSIS_TEST_MONGO_URI"))) {
            var mongo = new MongoTemplate(client, "cf359_test_" + UUID.randomUUID().toString().replace("-", ""));
            var settings = AdmissionSettings.defaults();
            var clock = Clock.fixed(Instant.parse("2030-01-01T00:00:00Z"), ZoneOffset.UTC);
            var ledger = new UsageLedger(new MongoUsageStore(mongo), clock, settings);
            var gate = new ExecutionGate(1, 1, settings.queueWait());
            var admission = new AiAdmission(ledger, gate, settings, new SimpleMeterRegistry());
            AnalysisContext.begin("synthetic-install", settings.requestTimeout());
            try {
                var output = admission.logical(() -> {
                    for (var index = 0; index < 2; index++) {
                        admission.transmit(() -> "429");
                        assertThat(gate.active()).isZero();
                    }
                    return admission.transmit(() -> "valid");
                });
                assertThat(output).isEqualTo("valid");
                var user = mongo.findAll(UsageBucket.class).stream().filter(row -> row.id().startsWith("user:")).findFirst().orElseThrow();
                var global = mongo.findAll(UsageBucket.class).stream().filter(row -> row.id().startsWith("global:")).findFirst().orElseThrow();
                assertThat(user.used()).isEqualTo(1);
                assertThat(global.used()).isEqualTo(3);
                assertThat(global.entries().values()).allSatisfy(entry -> assertThat(entry.state()).isEqualTo(UsageBucket.State.COMMITTED));
                assertThatThrownBy(() -> admission.logical(() -> admission.transmit(() -> { throw new IllegalStateException("synthetic failure"); })))
                    .isInstanceOf(IllegalStateException.class);
                assertThat(mongo.findById(user.id(), UsageBucket.class).used()).isEqualTo(1);
                assertThat(mongo.findById(global.id(), UsageBucket.class).used()).isEqualTo(4);
                assertThat(mongo.findById("slots:synthetic-install", UsageBucket.class).used()).isZero();
                assertThatThrownBy(() -> admission.validatedResults(() -> {
                    admission.logical(() -> admission.transmit(() -> "structurally valid"));
                    throw new IllegalArgumentException("synthetic semantic validation failure");
                })).isInstanceOf(IllegalArgumentException.class);
                assertThat(mongo.findById(user.id(), UsageBucket.class).used()).isEqualTo(1);
                assertThat(mongo.findById(global.id(), UsageBucket.class).used()).isEqualTo(5);
            } finally { AnalysisContext.clear(); }
        }
    }
}
