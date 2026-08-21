package com.careerform.llm.mapping;

public final class LlmRequestTooLargeException extends RuntimeException {

    public LlmRequestTooLargeException(String message) {
        super(message);
    }
}
