package com.careerform.llm.mapping.application;

import com.careerform.llm.mapping.domain.LlmMappingRequest;
import com.careerform.llm.mapping.domain.LlmMappingResponse;

@FunctionalInterface
public interface MappingModelClient {

    LlmMappingResponse map(LlmMappingRequest request);
}
