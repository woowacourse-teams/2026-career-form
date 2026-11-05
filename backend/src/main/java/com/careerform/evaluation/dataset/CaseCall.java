package com.careerform.evaluation.dataset;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import com.careerform.evaluation.scoring.CallKind;
import tools.jackson.databind.JsonNode;

/**
 * 사례 안의 제품 API 호출 하나. {@code request}는 제품 코드가 만든 요청 본문이고,
 * {@code expected}는 항목 ID별 정답이다. 값 null은 매핑 불가 또는 기권이 정답이라는 뜻이다.
 */
public record CaseCall(
    int order,
    CallKind.Stage stage,
    CallKind kind,
    String endpoint,
    String requestDigest,
    JsonNode request,
    Map<String, String> expected,
    int estimatedModelCalls
) {

    public CaseCall {
        expected = Collections.unmodifiableMap(new LinkedHashMap<>(expected));
    }

    /** 섹션 범주가 확정되지 않은 칸. 제품은 이 칸을 확신도와 상관없이 자동으로 넣지 않고 확인 필요로 둔다. */
    public java.util.Set<String> unconfirmedFields() {
        java.util.Set<String> fields = new java.util.HashSet<>();
        request.path("sections").forEach(section -> {
            String category = section.path("category").asString("");
            if (com.careerform.formanalysis.generic.SectionCategories.MIXED.equals(category)
                || com.careerform.formanalysis.generic.SectionCategories.ABSTAIN.equals(category)) {
                section.path("fields").forEach(field -> fields.add(field.path("candidateId").asString()));
                section.path("items").forEach(item -> item.path("fields")
                    .forEach(field -> fields.add(field.path("candidateId").asString())));
            }
        });
        return fields;
    }
}
