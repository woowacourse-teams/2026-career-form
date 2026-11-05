package com.careerform.evaluation.run;

import java.util.Map;
import java.util.Optional;

/** 실행 등록에 필요한 데이터셋 요약. 등록 검사를 통과한 데이터셋만 찾아진다. */
@FunctionalInterface
public interface DatasetCatalog {

    Optional<DatasetSummary> find(String datasetId, int version);

    record DatasetSummary(String datasetId, int version, String digest, Map<String, SplitSummary> splits) {

        public DatasetSummary {
            splits = Map.copyOf(splits);
        }
    }

    /** 분할 하나의 사례 수, 채점할 제품 API 호출 수, 수집 때 기록한 내부 모델 호출 수. */
    record SplitSummary(int cases, int productCalls, int recordedModelCalls) {
    }
}
