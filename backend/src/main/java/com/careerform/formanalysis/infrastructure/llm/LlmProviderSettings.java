package com.careerform.formanalysis.infrastructure.llm;

public record LlmProviderSettings(
    String model,
    String reasoningEffort,
    int maxOutputTokens
) {
}
