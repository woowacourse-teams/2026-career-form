package com.careerform.evaluation.run;

import org.junit.jupiter.api.DisplayName;

@DisplayName("메모리 평가 실행 저장소 계약")
class InMemoryRunStoreTest extends RunStoreContract {

    @Override
    protected RunStore store() {
        return new InMemoryRunStore();
    }
}
