package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class AdmissionEnvironmentPolicyTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
        .withUserConfiguration(AdmissionConfiguration.class);

    @Test
    void rejectsEvaluationWithInstallationProtectionBeforeDatabaseInitialization() {
        runner.withPropertyValues("career-form.admission.enabled=true", "career-form.evaluation.enabled=true")
            .run(context -> {
                assertThat(context).hasFailed();
                assertThat(context.getStartupFailure()).isInstanceOf(IllegalStateException.class)
                    .hasStackTraceContaining("AI evaluation and installation protection cannot be enabled together");
            });
    }

    @Test
    void evaluationWithoutInstallationProtectionDoesNotRequireAdmissionStorage() {
        runner.withPropertyValues("career-form.admission.enabled=false", "career-form.evaluation.enabled=true")
            .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(AiAdmission.class));
    }
}
