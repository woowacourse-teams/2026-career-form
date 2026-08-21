package com.careerform.llm.mapping;

public record LlmProviderSettings(
    String model,
    String reasoningEffort,
    int maxOutputTokens
) {
}
