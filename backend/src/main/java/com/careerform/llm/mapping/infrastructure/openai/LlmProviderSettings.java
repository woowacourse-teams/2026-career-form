package com.careerform.llm.mapping.infrastructure.openai;

public record LlmProviderSettings(
    String model,
    String reasoningEffort,
    int maxOutputTokens
) {
}
