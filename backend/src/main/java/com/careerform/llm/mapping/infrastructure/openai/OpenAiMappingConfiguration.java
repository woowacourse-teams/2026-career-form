package com.careerform.llm.mapping.infrastructure.openai;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import com.careerform.llm.mapping.application.MappingModelClient;
import com.careerform.llm.mapping.config.LlmMappingProperties;

import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(
    prefix = "career-form.llm",
    name = "provider",
    havingValue = "openai",
    matchIfMissing = true
)
public class OpenAiMappingConfiguration {

    private static final String SUPPORTED_MODEL = "gpt-5.6-luna";

    @Bean
    @ConditionalOnMissingBean(MappingModelClient.class)
    @ConditionalOnProperty(
        prefix = "career-form.llm",
        name = "enabled",
        havingValue = "true"
    )
    MappingModelClient openAiMappingModelClient(
        ChatClient.Builder chatClientBuilder,
        LlmMappingProperties properties,
        ObjectMapper objectMapper,
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
        LlmProviderSettings settings = new LlmProviderSettings(
            properties.model(),
            "none",
            properties.maxOutputTokens()
        );
        return new OpenAiMappingModelClient(chatClientBuilder, settings, objectMapper);
    }
}
