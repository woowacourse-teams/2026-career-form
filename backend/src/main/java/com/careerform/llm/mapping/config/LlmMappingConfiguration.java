package com.careerform.llm.mapping.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import com.careerform.llm.mapping.application.LlmMappingService;
import com.careerform.llm.mapping.application.LlmMappingValidator;
import com.careerform.llm.mapping.application.MappingModelClient;
import com.careerform.llm.mapping.infrastructure.openai.LlmProviderSettings;
import com.careerform.llm.mapping.infrastructure.openai.OpenAiMappingModelClient;

import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(LlmMappingProperties.class)
class LlmMappingConfiguration {

    private static final String SUPPORTED_MODEL = "gpt-5.6-luna";

    @Bean
    @ConditionalOnProperty(
        prefix = "career-form.llm",
        name = "enabled",
        havingValue = "true"
    )
    LlmMappingValidator llmMappingValidator() {
        return new LlmMappingValidator();
    }

    @Bean
    @ConditionalOnProperty(
        prefix = "career-form.llm",
        name = "enabled",
        havingValue = "true"
    )
    LlmMappingService llmMappingService(
        MappingModelClient modelClient,
        LlmMappingValidator validator
    ) {
        return new LlmMappingService(modelClient, validator);
    }

    @Bean
    @ConditionalOnProperty(
        prefix = "career-form.llm",
        name = "enabled",
        havingValue = "true"
    )
    LlmProviderSettings llmProviderSettings(
        LlmMappingProperties properties,
        @Value("${spring.ai.openai.api-key:}") String apiKey
    ) {
        if (!StringUtils.hasText(apiKey)) {
            throw new IllegalStateException(
                "LLM 활성화에는 OpenAI API key 설정이 필요합니다"
            );
        }
        if (!SUPPORTED_MODEL.equals(properties.model())) {
            throw new IllegalStateException(
                "LLM 활성화에는 gpt-5.6-luna model 설정이 필요합니다"
            );
        }
        return new LlmProviderSettings(
            properties.model(),
            "none",
            properties.maxOutputTokens()
        );
    }

    @Bean
    @ConditionalOnMissingBean(MappingModelClient.class)
    @ConditionalOnProperty(
        prefix = "career-form.llm",
        name = "enabled",
        havingValue = "true"
    )
    MappingModelClient openAiMappingModelClient(
        ChatClient.Builder chatClientBuilder,
        LlmProviderSettings settings,
        ObjectMapper objectMapper
    ) {
        return new OpenAiMappingModelClient(chatClientBuilder, settings, objectMapper);
    }
}
