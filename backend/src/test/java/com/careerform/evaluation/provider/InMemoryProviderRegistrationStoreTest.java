package com.careerform.evaluation.provider;

import org.junit.jupiter.api.DisplayName;

@DisplayName("메모리 평가 공급자 등록 저장소 계약")
class InMemoryProviderRegistrationStoreTest extends ProviderRegistrationStoreContract {

    @Override
    protected ProviderRegistrationStore store() {
        return new InMemoryProviderRegistrationStore();
    }
}
