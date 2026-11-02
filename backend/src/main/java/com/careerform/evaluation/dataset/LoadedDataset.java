package com.careerform.evaluation.dataset;

import java.util.List;

/** 등록 검사를 통과한 데이터셋. {@code digest}는 manifest 바이트의 sha256이다. */
public record LoadedDataset(String datasetId, int version, String digest, List<EvaluationCase> cases) {

    public LoadedDataset {
        cases = List.copyOf(cases);
    }

    /** 데이터셋의 모든 사례를 뜻하는 분할 이름. */
    public static final String ALL = "all";

    /** 분할의 사례. {@link #ALL}이면 모든 사례다. */
    public List<EvaluationCase> casesIn(String split) {
        return ALL.equals(split) ? cases
            : cases.stream().filter(evaluationCase -> evaluationCase.split().equals(split)).toList();
    }
}
