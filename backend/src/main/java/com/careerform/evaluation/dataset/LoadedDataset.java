package com.careerform.evaluation.dataset;

import java.util.List;

/** 등록 검사를 통과한 데이터셋. {@code digest}는 manifest 바이트의 sha256이다. */
public record LoadedDataset(String datasetId, int version, String digest, List<EvaluationCase> cases) {

    public LoadedDataset {
        cases = List.copyOf(cases);
    }

    public List<EvaluationCase> casesIn(String split) {
        return cases.stream().filter(evaluationCase -> evaluationCase.split().equals(split)).toList();
    }
}
