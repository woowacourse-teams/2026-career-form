package com.careerform.evaluation.scoring;

import java.util.Map;

/**
 * 실행 하나의 집계. 정확도는 채점 가능한 호출 점수의 평균이고, 채점 가능한 호출이 없으면 측정 불가(null)다.
 * 실패율은 실패 또는 채점 불가 호출 수를 전체 호출 수로 나눈 값이며 호출이 없으면 null이다.
 */
public record RunAggregate(
    Double accuracy,
    Double preparationAccuracy,
    Double mappingAccuracy,
    Double failureRate,
    int totalCalls,
    int scorableCalls,
    long modelCalls,
    Map<FailureKind, Long> failures,
    ItemCounts items
) {

    public RunAggregate {
        failures = Map.copyOf(failures);
    }
}
