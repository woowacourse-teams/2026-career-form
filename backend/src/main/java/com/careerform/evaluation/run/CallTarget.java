package com.careerform.evaluation.run;

import java.util.Map;

/** 제품 호출 한 건을 보낼 공급자, 모델, 실행 설정. 실행 버전({@link RunVersions})에서 만든다. */
public record CallTarget(String provider, String model, Map<String, String> settings) {

    public CallTarget {
        settings = Map.copyOf(settings);
    }

    public static CallTarget of(RunVersions versions) {
        return new CallTarget(versions.provider(), versions.model(), versions.settings());
    }
}
