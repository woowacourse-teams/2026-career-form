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
}
