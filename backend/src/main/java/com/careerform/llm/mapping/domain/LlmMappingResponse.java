package com.careerform.llm.mapping.domain;

import java.util.List;

public record LlmMappingResponse(
    int schemaVersion,
    List<Mapping> mappings
) {

    public record Mapping(
        String targetFieldId,
        String profileFieldKey,
        Double confidence
    ) {
    }
}
