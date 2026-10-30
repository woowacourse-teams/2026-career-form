package com.careerform.evaluation.run;

import java.util.Map;

/** 실행 등록 한도와 실행 시점의 서버 설정. {@code baseSettings}는 결과에 영향을 주는 모델 호출 설정이다. */
public record EvaluationSettings(
    int maxModelCallsPerRun,
    int maxRepetitions,
    String provider,
    String model,
    String codeVersion,
    Map<String, Integer> baseSettings
) {

    public EvaluationSettings {
        if (maxModelCallsPerRun < 1 || maxRepetitions < 1) {
            throw new IllegalStateException("평가 실행 한도는 1 이상이어야 합니다");
        }
        baseSettings = Map.copyOf(baseSettings);
    }
}
