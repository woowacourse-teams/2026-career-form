package com.careerform.llm.mapping.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@Validated
@ConfigurationProperties("career-form.llm")
public record LlmMappingProperties(
    boolean enabled,
    String model,
    @Min(1) @Max(100) int maxContextFields,
    @Min(1) @Max(100) int maxTargetFields,
    @Min(1024) @Max(262144) int maxRequestBytes,
    @Min(128) @Max(8192) int maxOutputTokens
) {
}
