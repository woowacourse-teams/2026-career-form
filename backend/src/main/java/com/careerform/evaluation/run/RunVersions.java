package com.careerform.evaluation.run;

import java.util.Collections;
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
    SortedMap<String, String> settings
) {

    public RunVersions {
        settings = Collections.unmodifiableSortedMap(new TreeMap<>(settings));
    }
}
