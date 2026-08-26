package com.careerform.formanalysis.infrastructure.llm;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.infrastructure.FormAnalysisConfiguration;
import com.careerform.formanalysis.infrastructure.llm.openai.OpenAiLlmConfiguration;
import com.careerform.formanalysis.infrastructure.llm.openai.OpenAiStructuredOutputClient;

import tools.jackson.databind.ObjectMapper;

class LlmConfigurationContextTest {

    private final WebApplicationContextRunner contextRunner =
        new WebApplicationContextRunner()
            .withUserConfiguration(
                FormAnalysisConfiguration.class,
                OpenAiLlmConfiguration.class,
                TestDependencies.class
            )
            .withPropertyValues(
                "career-form.form-analysis.max-request-bytes=65536",
                "career-form.llm.max-output-tokens=2048"
            );

    @Test
    void disabledConfigurationKeepsServicesWithoutProviderBeansOrCredentials() {
        contextRunner
            .withPropertyValues(
                "career-form.llm.enabled=false",
                "career-form.llm.provider=",
                "career-form.llm.model=",
                "spring.ai.openai.api-key="
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                assertThat(context).hasSingleBean(PreparationAnalysisService.class);
                assertThat(context).hasSingleBean(FieldsAnalysisService.class);
                assertThat(context).doesNotHaveBean(ActionResolver.class);
                assertThat(context).doesNotHaveBean(FieldMappingResolver.class);
                assertThat(context).doesNotHaveBean(OpenAiStructuredOutputClient.class);
            });
    }

    @Test
    void enabledConfigurationFailsWhenProviderIsMissing() {
        enabledRunner()
            .run(context -> assertStartupFailure(
                context.getStartupFailure(),
                "LLM 활성화에는 openai provider 설정이 필요합니다"
            ));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "alternative"})
    void enabledConfigurationFailsWhenProviderIsBlankOrUnsupported(String provider) {
        enabledRunner()
            .withPropertyValues("career-form.llm.provider=" + provider)
            .run(context -> assertStartupFailure(
                context.getStartupFailure(),
                "LLM 활성화에는 openai provider 설정이 필요합니다"
            ));
    }

    @Test
    void enabledConfigurationFailsWhenModelIsMissing() {
        enabledRunner()
            .withPropertyValues("career-form.llm.provider=openai")
            .run(context -> assertStartupFailure(
                context.getStartupFailure(),
                "LLM 활성화에는 gpt-5.6-luna model 설정이 필요합니다"
            ));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "another-model"})
    void enabledConfigurationFailsWhenModelIsBlankOrUnsupported(String model) {
        enabledRunner()
            .withPropertyValues(
                "career-form.llm.provider=openai",
                "career-form.llm.model=" + model
            )
            .run(context -> assertStartupFailure(
                context.getStartupFailure(),
                "LLM 활성화에는 gpt-5.6-luna model 설정이 필요합니다"
            ));
    }

    @Test
    void enabledConfigurationFailsWhenApiKeyIsBlankWithoutLeakingIt() {
        enabledRunner()
            .withPropertyValues(
                "career-form.llm.provider=openai",
                "career-form.llm.model=gpt-5.6-luna",
                "spring.ai.openai.api-key="
            )
            .run(context -> assertStartupFailure(
                context.getStartupFailure(),
                "LLM 활성화에는 OpenAI API key 설정이 필요합니다"
            ));
    }

    @Test
    void enabledConfigurationFailsWhenOutputTokenLimitIsNotContractValue() {
        enabledRunner()
            .withPropertyValues(
                "career-form.llm.provider=openai",
                "career-form.llm.model=gpt-5.6-luna",
                "career-form.llm.max-output-tokens=2049",
                "spring.ai.openai.api-key=synthetic-private-key"
            )
            .run(context -> assertStartupFailure(
                context.getStartupFailure(),
                "LLM 활성화에는 2048 output token 설정이 필요합니다"
            ));
    }

    @Test
    void enabledValidConfigurationCreatesBothResolversAndServices() {
        String privateKey = "synthetic-private-key";

        enabledRunner()
            .withPropertyValues(
                "career-form.llm.provider=openai",
                "career-form.llm.model=gpt-5.6-luna",
                "spring.ai.openai.api-key=" + privateKey
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                assertThat(context).hasSingleBean(OpenAiStructuredOutputClient.class);
                assertThat(context).hasSingleBean(ActionResolver.class);
                assertThat(context).hasSingleBean(FieldMappingResolver.class);
                assertThat(context).hasSingleBean(PreparationAnalysisService.class);
                assertThat(context).hasSingleBean(FieldsAnalysisService.class);
                assertThat(context.getBean(ActionResolver.class))
                    .isInstanceOf(LlmActionResolver.class);
                assertThat(context.getBean(FieldMappingResolver.class))
                    .isInstanceOf(LlmFieldMappingResolver.class);
            });
    }

    private WebApplicationContextRunner enabledRunner() {
        return contextRunner.withPropertyValues("career-form.llm.enabled=true");
    }

    private static void assertStartupFailure(Throwable failure, String message) {
        assertThat(failure).isNotNull();
        assertThat(rootCause(failure))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage(message)
            .hasMessageNotContaining("synthetic-private-key");
    }

    private static Throwable rootCause(Throwable failure) {
        Throwable current = failure;
        while (current != null && current.getCause() != null) {
            current = current.getCause();
        }
        return current;
    }

    @Configuration(proxyBeanMethods = false)
    static class TestDependencies {

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean
        ChatClient.Builder chatClientBuilder() {
            return ChatClient.builder(prompt -> {
                throw new AssertionError("설정 검증 중 모델을 호출하면 안 됩니다");
            });
        }
    }
}
