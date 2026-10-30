package com.careerform.evaluation.run;

import org.junit.jupiter.api.DisplayName;

@DisplayName("메모리 평가 결과 저장소 계약")
class InMemoryResultStoreTest extends ResultStoreContract {

    @Override
    protected ResultStore store() {
        return new InMemoryResultStore();
    }
}
