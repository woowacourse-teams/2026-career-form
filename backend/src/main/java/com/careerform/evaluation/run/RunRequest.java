package com.careerform.evaluation.run;

import java.util.List;
import java.util.Map;

/**
 * 평가 실행 등록 요청. {@code promptVersion}은 사람이 붙이는 이름이며 없어도 된다.
 * {@code overrides}는 허용한 서버 설정만 바꾼다. 모델은 둘 중 하나로 고른다.
 * <ul>
 *   <li>{@code targets}: 여러 공급자·모델을 같은 조건으로 비교한다. 모델마다 실행 하나를 만들어 차례로 돌린다.</li>
 *   <li>{@code provider}·{@code model}: 한 모델만 돌린다. 없으면 기본 공급자의 기본 모델이다.</li>
 * </ul>
 */
public record RunRequest(
    String datasetId,
    int datasetVersion,
    String split,
    int repetitions,
    String promptVersion,
    Map<String, Integer> overrides,
    String provider,
    String model,
    List<Target> targets
) {
    public RunRequest {
        overrides = overrides == null ? Map.of() : Map.copyOf(overrides);
        targets = targets == null ? null : List.copyOf(targets);
    }

    public RunRequest(String datasetId, int datasetVersion, String split, int repetitions, String promptVersion,
        Map<String, Integer> overrides, String provider, String model) {
        this(datasetId, datasetVersion, split, repetitions, promptVersion, overrides, provider, model, null);
    }

    public RunRequest(String datasetId, int datasetVersion, String split, int repetitions, String promptVersion,
        Map<String, Integer> overrides) {
        this(datasetId, datasetVersion, split, repetitions, promptVersion, overrides, null, null, null);
    }

    /** 비교할 공급자와 모델. {@code model}이 없으면 그 공급자의 기본 모델이다. */
    public record Target(String provider, String model) {
    }
}
