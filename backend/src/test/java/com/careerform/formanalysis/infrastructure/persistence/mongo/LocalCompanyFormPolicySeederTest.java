package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

@DisplayName("로컬 회사 지원서 정책 seed")
class LocalCompanyFormPolicySeederTest {

    @Test
    @DisplayName("SK 정책 v1을 먼저 저장하고 회사의 활성 버전을 v1로 덮어쓴다")
    void overwritesTheDeterministicSkSeedOnEveryRun() throws Exception {
        FormAnalysisCompanyMongoRepository companies = mock(
            FormAnalysisCompanyMongoRepository.class
        );
        FormAnalysisPolicyMongoRepository policies = mock(
            FormAnalysisPolicyMongoRepository.class
        );
        LocalCompanyFormPolicySeeder seeder = new LocalCompanyFormPolicySeeder(
            companies,
            policies
        );
        ArgumentCaptor<FormAnalysisPolicyDocument> policy = ArgumentCaptor.forClass(
            FormAnalysisPolicyDocument.class
        );
        ArgumentCaptor<FormAnalysisCompanyDocument> company = ArgumentCaptor.forClass(
            FormAnalysisCompanyDocument.class
        );

        seeder.run(null);

        InOrder order = inOrder(policies, companies);
        order.verify(policies).save(policy.capture());
        order.verify(companies).save(company.capture());
        assertThat(policy.getValue().id()).isEqualTo("sk-policy-v1");
        assertThat(policy.getValue().companyKey()).isEqualTo("sk");
        assertThat(policy.getValue().version()).isEqualTo(1);
        assertThat(policy.getValue().actionRules()).hasSize(2);
        assertThat(policy.getValue().fieldRules()).hasSize(6);
        assertThat(company.getValue()).isEqualTo(new FormAnalysisCompanyDocument(
            "sk",
            "sk",
            "www.skcareers.com",
            java.util.List.of("/Recruit/Apply/"),
            1
        ));
    }
}
