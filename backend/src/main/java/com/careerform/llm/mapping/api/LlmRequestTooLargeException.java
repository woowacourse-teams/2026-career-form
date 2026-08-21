package com.careerform.llm.mapping.api;

final class LlmRequestTooLargeException extends RuntimeException {

    LlmRequestTooLargeException(String message) {
        super(message);
    }
}
