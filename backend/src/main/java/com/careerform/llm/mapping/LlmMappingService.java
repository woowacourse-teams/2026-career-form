package com.careerform.llm.mapping;

import java.util.List;

public final class LlmMappingService {

    private static final String UPSTREAM_ERROR = "LLM 매핑 응답 계약을 확인할 수 없습니다";

    private final MappingModelClient modelClient;
    private final LlmMappingValidator validator;

    public LlmMappingService(MappingModelClient modelClient, LlmMappingValidator validator) {
        this.modelClient = modelClient;
        this.validator = validator;
    }

    public LlmMappingResponse map(LlmMappingRequest request) {
        validator.validateRequest(request);
        try {
            LlmMappingResponse response = modelClient.map(request);
            validator.validateResponse(request, response);
            return new LlmMappingResponse(1, List.copyOf(response.mappings()));
        }
        catch (LlmUpstreamException exception) {
            throw exception;
        }
        catch (RuntimeException exception) {
            throw new LlmUpstreamException(UPSTREAM_ERROR, exception);
        }
    }
}
