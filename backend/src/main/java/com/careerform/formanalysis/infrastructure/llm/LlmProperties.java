package com.careerform.formanalysis.infrastructure.llm;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@Validated
@ConfigurationProperties("career-form.llm")
public record LlmProperties(
    boolean enabled,
    String provider,
    String model,
    @Min(128) @Max(8192) int maxOutputTokens
) {
}
