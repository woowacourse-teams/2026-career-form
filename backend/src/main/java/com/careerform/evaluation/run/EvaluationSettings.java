package com.careerform.evaluation.run;

import java.util.Map;

/**
 * 실행 등록 한도와 실행 시점의 서버 설정. {@code baseSettings}는 공급자와 무관하게 결과에 영향을 주는
 * 설정(배치, 병렬)이고, 공급자별 설정은 {@link EvaluationProviders.Provider#settings()}에 있다.
 */
public record EvaluationSettings(
    int maxModelCallsPerRun,
    int maxRepetitions,
    String codeVersion,
    Map<String, Integer> baseSettings
) {

    public EvaluationSettings {
        if (maxModelCallsPerRun < 1 || maxRepetitions < 1) {
            throw new IllegalStateException("평가 실행 한도는 1 이상이어야 합니다");
        }
        baseSettings = Map.copyOf(baseSettings);
    }

    /** 이미지에 담긴 커밋(짧은 SHA)을 코드 버전으로 쓰고, 커밋이 없는 빌드는 {@code fallback}(이미지, 로컬 버전)을 쓴다. */
    public static String codeVersion(String commit, String fallback) {
        if (commit == null || commit.isBlank()) {
            return fallback;
        }
        String trimmed = commit.strip();
        return trimmed.length() > 7 ? trimmed.substring(0, 7) : trimmed;
    }
}
