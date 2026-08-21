package com.careerform.llm.mapping.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.careerform.llm.mapping.application.LlmMappingService;
import com.careerform.llm.mapping.application.LlmMappingValidator;
import com.careerform.llm.mapping.application.MappingModelClient;

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
    LlmMappingService llmMappingService(
        MappingModelClient modelClient,
        LlmMappingValidator validator
    ) {
        return new LlmMappingService(modelClient, validator);
    }

}
