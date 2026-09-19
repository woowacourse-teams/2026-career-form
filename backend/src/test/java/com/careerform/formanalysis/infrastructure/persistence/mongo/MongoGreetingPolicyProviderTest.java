package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;

@DisplayName("Greeting 공통 정책 조회")
class MongoGreetingPolicyProviderTest {

    private final FormAnalysisPolicyMongoRepository policies =
        mock(FormAnalysisPolicyMongoRepository.class);
    private final SupportedProfileFields profileFields = new SupportedProfileFields();

    @Test
    @DisplayName("두 도메인이 공유할 Greeting 버전 1 정책을 읽는다")
    void loadsTheSharedPolicy() {
        when(policies.findByCompanyKeyAndVersion("greeting", 1))
            .thenReturn(Optional.of(GreetingCompanyFormPolicyFactory.create()));

        Object result = new MongoGreetingPolicyProvider(policies, profileFields, 1).find();

        assertThat(result).isInstanceOfSatisfying(Available.class, available -> {
            assertThat(available.policy().companyKey()).isEqualTo("greeting");
            assertThat(available.policy().version()).isEqualTo(1);
            assertThat(available.policy().fieldRules()).hasSize(2);
        });
    }

    @Test
    @DisplayName("정책이 없거나 조회에 실패하면 범용으로 넘기지 않는다")
    void reportsUnavailableForMissingOrFailedPolicy() {
        when(policies.findByCompanyKeyAndVersion("greeting", 1))
            .thenReturn(Optional.empty())
            .thenThrow(new DataAccessResourceFailureException("synthetic-db-failure"));
        MongoGreetingPolicyProvider provider =
            new MongoGreetingPolicyProvider(policies, profileFields, 1);

        assertThat(provider.find()).isInstanceOf(Unavailable.class);
        assertThat(provider.find()).isInstanceOf(Unavailable.class);
    }

    @Test
    @DisplayName("유효하지 않은 활성 버전은 정책 조회 없이 차단한다")
    void rejectsInvalidActiveVersion() {
        assertThat(new MongoGreetingPolicyProvider(policies, profileFields, 0).find())
            .isInstanceOf(Unavailable.class);
    }
}
