package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;

class AdmissionDeploymentPropertiesTest {
    @Test
    void absentDeploymentFlagsKeepProtectionAndRegistrationDisabled() throws IOException {
        var environment = environment(Map.of());
        assertThat(environment.getProperty("career-form.admission.enabled", Boolean.class)).isFalse();
        assertThat(environment.getProperty("career-form.admission.registration-enabled", Boolean.class)).isFalse();
    }

    @Test
    void containerEnvironmentReachesTheAdmissionProperties() throws IOException {
        var environment = environment(Map.of(
            "CAREER_FORM_ADMISSION_ENABLED", "true",
            "CAREER_FORM_ADMISSION_REGISTRATION_ENABLED", "true",
            "CAREER_FORM_ADMISSION_TRUSTED_PROXIES", "127.0.0.1,172.19.0.1",
            "CAREER_FORM_ADMISSION_ENCRYPTION_KEY", "synthetic"));
        assertThat(environment.getProperty("career-form.admission.enabled", Boolean.class)).isTrue();
        assertThat(environment.getProperty("career-form.admission.registration-enabled", Boolean.class)).isTrue();
        assertThat(environment.getProperty("career-form.admission.trusted-proxies")).isEqualTo("127.0.0.1,172.19.0.1");
        assertThat(environment.getProperty("career-form.admission.encryption-key")).isEqualTo("synthetic");
    }

    @Test
    void deploymentFlagsAlsoEnforceTheEvaluationConflictPolicy() throws IOException {
        var environment = environment(Map.of(
            "CAREER_FORM_ADMISSION_ENABLED", "true", "CAREER_FORM_EVALUATION_ENABLED", "true"));
        new ApplicationContextRunner().withUserConfiguration(AdmissionConfiguration.class)
            .withInitializer(context -> context.setEnvironment(environment))
            .run(context -> {
                assertThat(context).hasFailed();
                assertThat(context.getStartupFailure()).isInstanceOf(IllegalStateException.class)
                    .hasMessage("AI evaluation and installation protection cannot be enabled together");
            });
    }

    private MockEnvironment environment(Map<String, Object> deployment) throws IOException {
        var environment = new MockEnvironment();
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource("deployment", deployment));
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) {
            environment.getPropertySources().addLast(source);
        }
        return environment;
    }
}
