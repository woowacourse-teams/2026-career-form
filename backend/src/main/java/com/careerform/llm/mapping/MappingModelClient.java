package com.careerform.llm.mapping;

@FunctionalInterface
public interface MappingModelClient {

    LlmMappingResponse map(LlmMappingRequest request);
}
