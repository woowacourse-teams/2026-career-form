package com.careerform.llm.mapping;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import tools.jackson.databind.ObjectMapper;

class LlmConfigurationContextTest {

    private final WebApplicationContextRunner contextRunner =
        new WebApplicationContextRunner()
            .withUserConfiguration(
                LlmMappingConfiguration.class,
                TestDependencies.class
            )
            .withPropertyValues(
                "career-form.llm.max-context-fields=50",
                "career-form.llm.max-target-fields=50",
                "career-form.llm.max-request-bytes=65536",
                "career-form.llm.max-output-tokens=2048"
            );

    @Test
    void disabledConfigurationStartsWithoutApiKeyOrLlmBeans() {
        contextRunner
            .withPropertyValues(
                "career-form.llm.enabled=false",
                "career-form.llm.model="
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                assertThat(context).doesNotHaveBean(LlmProviderSettings.class);
                assertThat(context).doesNotHaveBean(MappingModelClient.class);
                assertThat(context).doesNotHaveBean(LlmMappingService.class);
            });
    }

    @Test
    void enabledConfigurationFailsWhenApiKeyIsBlank() {
        contextRunner
            .withPropertyValues(
                "career-form.llm.enabled=true",
                "career-form.llm.model=gpt-5.6-luna",
                "spring.ai.openai.api-key="
            )
            .run(context -> assertStartupFailure(
                context.getStartupFailure(),
                "LLM 활성화에는 OpenAI API key 설정이 필요합니다"
            ));
    }

    @Test
    void enabledConfigurationFailsWhenModelIsBlankWithoutExposingApiKey() {
        String privateKey = "test-private-api-key";

        contextRunner
            .withPropertyValues(
                "career-form.llm.enabled=true",
                "career-form.llm.model=",
                "spring.ai.openai.api-key=" + privateKey
            )
            .run(context -> {
                Throwable rootCause = rootCause(context.getStartupFailure());
                assertThat(rootCause)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessage("LLM 활성화에는 gpt-5.6-luna model 설정이 필요합니다")
                    .hasMessageNotContaining(privateKey);
            });
    }

    @Test
    void enabledConfigurationFailsWhenModelIsNotPinned() {
        contextRunner
            .withPropertyValues(
                "career-form.llm.enabled=true",
                "career-form.llm.model=another-model",
                "spring.ai.openai.api-key=test-key"
            )
            .run(context -> assertStartupFailure(
                context.getStartupFailure(),
                "LLM 활성화에는 gpt-5.6-luna model 설정이 필요합니다"
            ));
    }

    @Test
    void enabledValidConfigurationCreatesProviderWithoutCallingIt() {
        contextRunner
            .withPropertyValues(
                "career-form.llm.enabled=true",
                "career-form.llm.model=gpt-5.6-luna",
                "spring.ai.openai.api-key=test-key"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                assertThat(context).hasSingleBean(LlmProviderSettings.class);
                assertThat(context).hasSingleBean(MappingModelClient.class);
                assertThat(context).hasSingleBean(LlmMappingService.class);
                assertThat(context.getBean(LlmProviderSettings.class))
                    .isEqualTo(new LlmProviderSettings("gpt-5.6-luna", "none", 2048));
                assertThat(context.getBean(MappingModelClient.class))
                    .isInstanceOf(OpenAiMappingModelClient.class);
            });
    }

    private static void assertStartupFailure(Throwable failure, String expectedMessage) {
        assertThat(failure).isNotNull();
        assertThat(rootCause(failure))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage(expectedMessage);
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
