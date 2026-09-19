package com.careerform.architecture.fixture.invalid.application;

import org.springframework.ai.openai.OpenAiChatOptions;

public final class InvalidProviderService {

    private final OpenAiChatOptions options;

    public InvalidProviderService(OpenAiChatOptions options) {
        this.options = options;
    }

    public OpenAiChatOptions options() {
        return options;
    }
}
