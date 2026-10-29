package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoClients;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@EnabledIfEnvironmentVariable(named = "ANALYSIS_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+")
class JevAdmissionTest {
    @Test
    @SuppressWarnings("unchecked")
    void chooseAndAnswerUseSameTransmissionBudgetAndValidationSettlement() throws Exception {
        try (var client = MongoClients.create(System.getenv("ANALYSIS_TEST_MONGO_URI"))) {
            var mongo = new MongoTemplate(client, "cf359_test_" + UUID.randomUUID().toString().replace("-", ""));
            var settings = AdmissionSettings.defaults();
            var meters = new SimpleMeterRegistry();
            var admission = new AiAdmission(new UsageLedger(new MongoUsageStore(mongo), Clock.systemUTC(), settings),
                new ExecutionGate(2, 2, settings.queueWait()), settings, meters);
            var jev = new JevClient("synthetic", "jev-test", 1000, 0.8, true);
            var control = JevClient.class.getDeclaredField("admission");
            control.setAccessible(true);
            control.set(jev, admission);
            var http = mock(HttpClient.class);
            HttpResponse<String> response = mock(HttpResponse.class);
            when(response.statusCode()).thenReturn(200);
            when(response.body()).thenReturn("{\"model\":\"jev-test\",\"answers\":{\"q\":{\"type\":\"choice\",\"choice\":\"YES\",\"confidence\":0.9,\"probabilities\":{\"YES\":0.9,\"ABSTAIN\":0.1}}},\"usage\":{\"input_tokens\":1,\"output_tokens\":1}}");
            when(http.sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenReturn(CompletableFuture.completedFuture(response));
            var transport = JevClient.class.getDeclaredField("http");
            transport.setAccessible(true);
            transport.set(jev, http);
            var question = Map.of("q", new JevClient.Choice("synthetic", Map.of("YES", "synthetic", "ABSTAIN", "synthetic")));
            AnalysisContext.begin("synthetic-install", settings.requestTimeout());
            try {
                assertThat(jev.choose(Map.of(), question)).containsEntry("q", "YES");
                assertThat(jev.answer(Map.of(), question).get("q").choice()).isEqualTo("YES");
                assertThat(meters.counter("analysis.admission.transport.attempts").count()).isEqualTo(2);
                assertThat(mongo.findAll(UsageBucket.class).stream().filter(row -> row.id().startsWith("user:")).mapToInt(UsageBucket::used).sum())
                    .isEqualTo(2);
                assertThat(mongo.findAll(UsageBucket.class).stream().filter(row -> row.id().startsWith("global:")).mapToInt(UsageBucket::used).sum())
                    .isEqualTo(2);
            } finally { AnalysisContext.clear(); }
        }
    }
}
