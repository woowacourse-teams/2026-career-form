package com.careerform.llm.mapping;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(LlmMappingProperties.class)
class LlmMappingConfiguration {

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
    LlmRequestLimits llmRequestLimits(
        LlmMappingProperties properties,
        ObjectMapper objectMapper
    ) {
        return new LlmRequestLimits(properties, objectMapper);
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
}
