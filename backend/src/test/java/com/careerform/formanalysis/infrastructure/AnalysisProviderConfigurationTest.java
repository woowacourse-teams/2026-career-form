package com.careerform.formanalysis.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;

import org.junit.jupiter.api.Test;
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
