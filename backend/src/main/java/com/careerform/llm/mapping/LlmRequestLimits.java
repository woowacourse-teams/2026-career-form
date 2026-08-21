package com.careerform.llm.mapping;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

final class LlmRequestLimits {

    private static final String INVALID_REQUEST = "LLM 매핑 요청 계약이 올바르지 않습니다";

    private final LlmMappingProperties properties;
    private final ObjectMapper objectMapper;

    LlmRequestLimits(LlmMappingProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    void validate(LlmMappingRequest request) {
        if (request == null || request.contextFields() == null || request.targetFields() == null
            || request.contextFields().size() > properties.maxContextFields()
            || request.targetFields().size() > properties.maxTargetFields()) {
            throw new InvalidLlmMappingRequestException(INVALID_REQUEST);
        }

        try {
            if (objectMapper.writeValueAsBytes(request).length > properties.maxRequestBytes()) {
                throw new LlmRequestTooLargeException(
                    "LLM 매핑 요청 크기 제한을 초과했습니다"
                );
            }
        }
        catch (JacksonException exception) {
            throw new InvalidLlmMappingRequestException(INVALID_REQUEST);
        }
    }
}
