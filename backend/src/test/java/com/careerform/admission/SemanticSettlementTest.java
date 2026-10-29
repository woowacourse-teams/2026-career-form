package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoClients;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@EnabledIfEnvironmentVariable(named = "ANALYSIS_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+")
class SemanticSettlementTest {
    @Test
    void structurallyValidButWrongSnapshotResponseDoesNotChargeUser() throws Exception {
        try (var client = MongoClients.create(System.getenv("ANALYSIS_TEST_MONGO_URI"))) {
            var mongo = new MongoTemplate(client, "cf359_test_" + UUID.randomUUID().toString().replace("-", ""));
            var settings = AdmissionSettings.defaults();
            var admission = new AiAdmission(new UsageLedger(new MongoUsageStore(mongo), Clock.systemUTC(), settings),
                new ExecutionGate(1, 1, settings.queueWait()), settings, new SimpleMeterRegistry());
            ActionResolver resolver = ignored -> admission.logical(() -> admission.transmit(() ->
                new ActionResolver.Resolution(2, "wrong-snapshot", List.of(new ActionResolver.NoAction("action")))));
            var service = new PreparationAnalysisService(Optional.of(resolver), new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()));
            var field = PreparationAnalysisService.class.getDeclaredField("admission");
            field.setAccessible(true);
            field.set(service, admission);
            var action = new PreparationAnalysisRequest.ActionCandidate("action", PreparationAnalysisRequest.FormElement.BUTTON,
                PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.VISIBLE, "synthetic", null, null, null, null, null);
            var request = new PreparationAnalysisRequest(2, "expected-snapshot", new PreparationAnalysisRequest.Site("example.test", "/apply"),
                List.of(new PreparationAnalysisRequest.Section("section", null, "synthetic", List.of(action), null)));
            AnalysisContext.begin("synthetic-install", settings.requestTimeout());
            try {
                assertThat(service.analyze(request).analysisStatus().name()).isEqualTo("PARTIAL");
                assertThat(mongo.findAll(UsageBucket.class).stream().filter(row -> row.id().startsWith("user:")).mapToInt(UsageBucket::used).sum()).isZero();
                assertThat(mongo.findAll(UsageBucket.class).stream().filter(row -> row.id().startsWith("global:")).mapToInt(UsageBucket::used).sum()).isEqualTo(1);
            } finally { AnalysisContext.clear(); }
        }
    }
}
