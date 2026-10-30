package com.careerform.evaluation.dataset;

import java.util.List;

/** 공고 화면 하나와 합성 프로필 하나로 만든 평가 사례. 호출은 제품이 보낸 순서대로다. */
public record EvaluationCase(
    String caseId,
    String split,
    String siteId,
    String state,
    String profileId,
    List<CaseCall> calls
) {

    public EvaluationCase {
        calls = List.copyOf(calls);
    }
}
