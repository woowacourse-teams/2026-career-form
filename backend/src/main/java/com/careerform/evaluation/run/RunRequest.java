package com.careerform.evaluation.run;

import java.util.Map;

/**
 * 평가 실행 등록 요청. {@code promptVersion}은 사람이 붙이는 이름이며 없어도 된다.
 * {@code overrides}는 허용한 서버 설정만 바꾼다.
 */
public record RunRequest(
    String datasetId,
    int datasetVersion,
    String split,
    int repetitions,
    String promptVersion,
    Map<String, Integer> overrides
) {

    public RunRequest {
        overrides = overrides == null ? Map.of() : Map.copyOf(overrides);
    }
}
