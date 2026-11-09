package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoClients;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@EnabledIfEnvironmentVariable(named = "ANALYSIS_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+")
class AdmissionConfigurationTest {
    @Test
    void registrationOnlyRolloutDoesNotEnforceAnalysisUntilEnabled() {
        try (var client = MongoClients.create(System.getenv("ANALYSIS_TEST_MONGO_URI"))) {
            var runner = new ApplicationContextRunner().withUserConfiguration(AdmissionConfiguration.class, InstallController.class)
                .withBean(MongoTemplate.class, () -> new MongoTemplate(client, "cf359_config_test"))
                .withBean(MeterRegistry.class, SimpleMeterRegistry::new)
                .withPropertyValues("career-form.admission.encryption-key=" + Base64.getEncoder().encodeToString(new byte[32]),
                    "career-form.admission.trusted-proxies=127.0.0.1");
            runner.run(context -> assertThat(context).doesNotHaveBean(InstallService.class));
            runner.withPropertyValues("career-form.admission.registration-enabled=true").run(context -> {
                assertThat(context).hasSingleBean(InstallService.class).hasSingleBean(InstallController.class);
                assertThat(context).doesNotHaveBean(AiAdmission.class);
                assertThat(context).doesNotHaveBean("admissionFilter");
            });
            runner.withPropertyValues("career-form.admission.enabled=true").run(context -> {
                assertThat(context).hasSingleBean(AiAdmission.class).hasBean("admissionFilter");
            });
        }
    }

    @Test
    void enabledConfigurationWithoutRequiredKeyFailsClosed() {
        new ApplicationContextRunner().withUserConfiguration(AdmissionConfiguration.class)
            .withPropertyValues("career-form.admission.enabled=true")
            .run(context -> assertThat(context).hasFailed());
    }
}
