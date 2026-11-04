package com.careerform.evaluation.run;

import java.util.Collections;
import java.util.Map;
import java.util.SortedMap;
import java.util.TreeMap;

/** 실행 결과를 해석하는 데 필요한 모든 버전. 같은 값이면 같은 조건의 실행이다. */
public record RunVersions(
    String datasetId,
    int datasetVersion,
    String datasetDigest,
    String split,
    String promptDigest,
    String promptVersion,
    String codeVersion,
    String provider,
    String model,
    String scoringVersion,
    SortedMap<String, String> settings,
    Map<String, String> inputs
) {

    public RunVersions {
        settings = Collections.unmodifiableSortedMap(new TreeMap<>(settings));
        inputs = inputs == null ? Map.of() : Collections.unmodifiableSortedMap(new TreeMap<>(inputs));
    }

    /** 자동 평가 입력 지문이 없는 실행(수동 실행, 이전 기록). */
    public RunVersions(String datasetId, int datasetVersion, String datasetDigest, String split, String promptDigest,
        String promptVersion, String codeVersion, String provider, String model, String scoringVersion,
        SortedMap<String, String> settings) {
        this(datasetId, datasetVersion, datasetDigest, split, promptDigest, promptVersion, codeVersion, provider, model,
            scoringVersion, settings, Map.of());
    }
}
