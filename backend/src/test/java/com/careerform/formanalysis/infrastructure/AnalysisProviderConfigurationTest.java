package com.careerform.formanalysis.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.mock.env.MockEnvironment;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;

class AnalysisProviderConfigurationTest {

    @Test
    void usesLegacyEnableWhenTheNewSettingIsAbsent() {
        AnalysisProviderSelection selection = AnalysisProviderSelection.from(
            environment("career-form.llm.enabled", "true")
        );

        assertThat(selection.enabled()).isTrue();
        assertThat(selection.provider()).isEqualTo("openai");
    }

    @Test
    void rejectsConflictingLegacyAndNewEnableSettings() {
        assertThatThrownBy(() -> AnalysisProviderSelection.from(environment(
            "career-form.analysis.enabled", "true",
            "career-form.llm.enabled", "false"
        ))).isInstanceOf(IllegalStateException.class)
            .hasMessage("Conflicting analysis enable settings");
    }

    @Test
    void rejectsAnUnknownProviderBeforeCreatingProviders() {
        assertThatThrownBy(() -> AnalysisProviderSelection.from(environment(
            "career-form.analysis.provider", "other"
        ))).isInstanceOf(IllegalStateException.class)
            .hasMessage("Unsupported analysis provider");
    }

    @Test
    void preservesConfiguredOpenAiTimeoutWhilePinningRetriesToZero() {
        MockEnvironment environment = environment(
            "career-form.analysis.enabled", "true",
            "spring.ai.openai.timeout", "45s"
        );

        new AnalysisProviderEnvironment().postProcessEnvironment(environment, new SpringApplication());

        assertThat(environment.getProperty("spring.ai.openai.timeout")).isEqualTo("45s");
        assertThat(environment.getProperty("spring.ai.openai.max-retries")).isEqualTo("0");
    }

    @Test
    void forcesOpenAiRetriesToZeroWhenAnExplicitRetryValueIsConfigured() {
        MockEnvironment environment = environment(
            "career-form.analysis.enabled", "true",
            "spring.ai.openai.timeout", "30s",
            "spring.ai.openai.max-retries", "9"
        );

        new AnalysisProviderEnvironment().postProcessEnvironment(environment, new SpringApplication());

        assertThat(environment.getProperty("spring.ai.openai.max-retries")).isEqualTo("0");
    }

    @Test
    void keepsOpenAiAutoConfigurationDisabledForDisabledAndJevAnalysis() {
        for (MockEnvironment environment : new MockEnvironment[] {
            environment("career-form.analysis.enabled", "false"),
            environment(
                "career-form.analysis.enabled", "true",
                "career-form.analysis.provider", "jev"
            )
        }) {
            new AnalysisProviderEnvironment().postProcessEnvironment(environment, new SpringApplication());

            assertThat(environment.getProperty("spring.ai.model.chat")).isEqualTo("none");
            assertThat(environment.getProperty("spring.ai.chat.client.enabled")).isEqualTo("false");
            assertThat(environment.getProperty("spring.ai.openai.max-retries")).isEqualTo("0");
        }
    }

    @Test
    void acceptsOpenAiTimeoutsInsideTheAnalysisBudget() {
        for (String timeout : new String[] {"1ms", "59999ms", "PT0.001S", "PT59.999S"}) {
            MockEnvironment environment = environment(
                "career-form.analysis.enabled", "true",
                "spring.ai.openai.timeout", timeout
            );

            new AnalysisProviderEnvironment().postProcessEnvironment(environment, new SpringApplication());

            assertThat(environment.getProperty("spring.ai.openai.timeout")).isEqualTo(timeout);
        }
    }

    @Test
    void rejectsInvalidOpenAiTimeoutsWithoutExposingTheirValues() {
        for (String timeout : new String[] {
            "0", "-1ms", "60s", "61s", "private-malformed-timeout-marker",
            "PT999999999999999999999999999999999999999999999999999999S"
        }) {
            MockEnvironment environment = environment(
                "career-form.analysis.enabled", "true",
                "spring.ai.openai.timeout", timeout
            );

            assertThatThrownBy(() -> new AnalysisProviderEnvironment()
                .postProcessEnvironment(environment, new SpringApplication()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Invalid OpenAI analysis timeout")
                .hasNoCause();
        }
    }

    @Test
    void rejectsEnabledConfigurationWithMissingPorts() {
        assertIncomplete(environment("career-form.analysis.enabled", "true"), context -> { });
    }

    @Test
    void rejectsEnabledConfigurationWithDuplicatePorts() {
        assertIncomplete(environment("career-form.analysis.enabled", "true"), context -> {
            context.getBeanFactory().registerSingleton("fieldOne", (FieldMappingResolver) request -> null);
            context.getBeanFactory().registerSingleton("fieldTwo", (FieldMappingResolver) request -> null);
        });
    }

    @Test
    void rejectsEnabledConfigurationWithMixedProviderPorts() {
        assertIncomplete(environment("career-form.analysis.enabled", "true"), context -> {
            context.getBeanFactory().registerSingleton("field", (FieldMappingResolver) request -> null);
            context.getBeanFactory().registerSingleton("action", (ActionResolver) request -> null);
            context.getBeanFactory().registerSingleton("interaction",
                (InteractionDecisionProvider) batch -> null);
        });
    }

    private static void assertIncomplete(MockEnvironment environment,
        java.util.function.Consumer<StaticApplicationContext> registrations) {
        StaticApplicationContext context = new StaticApplicationContext();
        context.refresh();
        registrations.accept(context);

        assertThatThrownBy(() -> new AnalysisProviderConfiguration()
            .analysisProviderContract(environment, context)
            .afterSingletonsInstantiated())
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Incomplete or mixed analysis provider configuration");
    }

    private static MockEnvironment environment(String... properties) {
        MockEnvironment environment = new MockEnvironment();
        for (int index = 0; index < properties.length; index += 2) {
            environment.setProperty(properties[index], properties[index + 1]);
        }
        return environment;
    }
}
