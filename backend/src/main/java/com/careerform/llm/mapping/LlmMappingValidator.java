package com.careerform.llm.mapping;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class LlmMappingValidator {

    private static final String INVALID_REQUEST = "LLM 매핑 요청 계약이 올바르지 않습니다";
    private static final String INVALID_UPSTREAM = "LLM 매핑 응답 계약을 확인할 수 없습니다";

    public void validateRequest(LlmMappingRequest request) {
        if (request == null || request.contextFields() == null || request.targetFields() == null
            || request.targetFields().isEmpty()) {
            throw invalidRequest();
        }

        Set<String> contextIds = uniqueContextIds(request.contextFields());
        Set<String> targetIds = uniqueTargetIds(request.targetFields());
        if (!disjoint(contextIds, targetIds)) {
            throw invalidRequest();
        }
    }

    public void validateResponse(LlmMappingRequest request, LlmMappingResponse response) {
        if (response == null || response.schemaVersion() != 1 || response.mappings() == null) {
            throw invalidUpstream();
        }

        Set<String> expected = targetIds(request.targetFields());
        Set<String> contextIds = contextIds(request.contextFields());
        Set<String> seen = new HashSet<>();
        for (LlmMappingResponse.Mapping mapping : response.mappings()) {
            if (invalidMapping(mapping, expected, contextIds, seen)) {
                throw invalidUpstream();
            }
        }
        if (!seen.equals(expected) || response.mappings().size() != expected.size()) {
            throw invalidUpstream();
        }
    }

    private static Set<String> uniqueContextIds(List<LlmMappingRequest.ContextField> fields) {
        Set<String> ids = new HashSet<>();
        for (LlmMappingRequest.ContextField field : fields) {
            if (field == null || field.fieldId() == null || !ids.add(field.fieldId())
                || !ProfileFieldKeys.isAllowed(field.profileFieldKey())) {
                throw invalidRequest();
            }
        }
        return Set.copyOf(ids);
    }

    private static Set<String> uniqueTargetIds(List<LlmMappingRequest.TargetField> fields) {
        Set<String> ids = new HashSet<>();
        for (LlmMappingRequest.TargetField field : fields) {
            if (field == null || field.fieldId() == null || !ids.add(field.fieldId())) {
                throw invalidRequest();
            }
        }
        return Set.copyOf(ids);
    }

    private static Set<String> contextIds(List<LlmMappingRequest.ContextField> fields) {
        Set<String> ids = new HashSet<>();
        for (LlmMappingRequest.ContextField field : fields) {
            if (field == null || field.fieldId() == null) {
                throw invalidUpstream();
            }
            ids.add(field.fieldId());
        }
        return Set.copyOf(ids);
    }

    private static Set<String> targetIds(List<LlmMappingRequest.TargetField> fields) {
        Set<String> ids = new HashSet<>();
        for (LlmMappingRequest.TargetField field : fields) {
            if (field == null || field.fieldId() == null) {
                throw invalidUpstream();
            }
            ids.add(field.fieldId());
        }
        return Set.copyOf(ids);
    }

    private static boolean invalidMapping(
        LlmMappingResponse.Mapping mapping,
        Set<String> expected,
        Set<String> contextIds,
        Set<String> seen
    ) {
        if (mapping == null || !expected.contains(mapping.targetFieldId())
            || contextIds.contains(mapping.targetFieldId()) || !seen.add(mapping.targetFieldId())) {
            return true;
        }
        if (!(ProfileFieldKeys.isAllowed(mapping.profileFieldKey())
            || "NO_MATCH".equals(mapping.profileFieldKey()))) {
            return true;
        }
        Double confidence = mapping.confidence();
        return confidence == null || !Double.isFinite(confidence)
            || confidence < 0.0 || confidence > 1.0;
    }

    private static boolean disjoint(Set<String> first, Set<String> second) {
        return first.stream().noneMatch(second::contains);
    }

    private static InvalidLlmMappingRequestException invalidRequest() {
        return new InvalidLlmMappingRequestException(INVALID_REQUEST);
    }

    private static LlmUpstreamException invalidUpstream() {
        return new LlmUpstreamException(INVALID_UPSTREAM);
    }
}
