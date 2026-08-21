package com.careerform.llm.mapping.application;

public final class LlmUpstreamException extends RuntimeException {

    public LlmUpstreamException(String message) {
        super(message);
    }

    public LlmUpstreamException(String message, Throwable cause) {
        super(message, cause);
    }
}
