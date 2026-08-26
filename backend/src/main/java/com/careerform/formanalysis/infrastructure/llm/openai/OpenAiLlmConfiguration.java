package com.careerform.formanalysis.infrastructure.llm.openai;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.infrastructure.llm.LlmActionResolver;
import com.careerform.formanalysis.infrastructure.llm.LlmFieldMappingResolver;
import com.careerform.formanalysis.infrastructure.llm.LlmProperties;
import com.careerform.formanalysis.infrastructure.llm.LlmProviderSettings;

import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(
    prefix = "career-form.llm",
    name = "enabled",
    havingValue = "true"
)
@EnableConfigurationProperties(LlmProperties.class)
public class OpenAiLlmConfiguration {

    private static final String SUPPORTED_PROVIDER = "openai";
    private static final String SUPPORTED_MODEL = "gpt-5.6-luna";
    private static final int SUPPORTED_MAX_OUTPUT_TOKENS = 2048;

    @Bean
    LlmProviderSettings llmProviderSettings(
        LlmProperties properties,
        @Value("${spring.ai.openai.api-key:}") String apiKey
    ) {
        if (!SUPPORTED_PROVIDER.equals(properties.provider())) {
            throw new IllegalStateException(
                "LLM 활성화에는 openai provider 설정이 필요합니다"
            );
        }
        if (!SUPPORTED_MODEL.equals(properties.model())) {
            throw new IllegalStateException(
                "LLM 활성화에는 gpt-5.6-luna model 설정이 필요합니다"
            );
        }
        if (properties.maxOutputTokens() != SUPPORTED_MAX_OUTPUT_TOKENS) {
            throw new IllegalStateException(
                "LLM 활성화에는 2048 output token 설정이 필요합니다"
            );
        }
        if (!StringUtils.hasText(apiKey)) {
            throw new IllegalStateException(
                "LLM 활성화에는 OpenAI API key 설정이 필요합니다"
            );
        }
        return new LlmProviderSettings(
            properties.model(),
            "none",
            properties.maxOutputTokens()
        );
    }

    @Bean
    OpenAiStructuredOutputClient openAiStructuredOutputClient(
        ChatClient.Builder chatClientBuilder,
        LlmProviderSettings settings,
        ObjectMapper objectMapper
    ) {
        return new OpenAiStructuredOutputClient(
            chatClientBuilder,
            settings,
            objectMapper
        );
    }

    @Bean
    ActionResolver llmActionResolver(OpenAiStructuredOutputClient client) {
        return new LlmActionResolver(client);
    }

    @Bean
    FieldMappingResolver llmFieldMappingResolver(
        OpenAiStructuredOutputClient client
    ) {
        return new LlmFieldMappingResolver(client);
    }
}
