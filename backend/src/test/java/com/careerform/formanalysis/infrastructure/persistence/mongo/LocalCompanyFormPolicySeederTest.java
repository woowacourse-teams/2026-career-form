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
    @DisplayName("정적 회사 정책 카탈로그의 SK와 Hyundai 등록을 모두 저장한다")
    void savesStaticCompanyCatalog() {
        FormAnalysisCompanyMongoRepository companies = mock(FormAnalysisCompanyMongoRepository.class);
        FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);

        org.mockito.Mockito.verify(companies, org.mockito.Mockito.times(2))
            .save(org.mockito.Mockito.any(FormAnalysisCompanyDocument.class));
        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2))
            .save(org.mockito.Mockito.any(FormAnalysisPolicyDocument.class));
    }

    @Test
    @DisplayName("실제 SK Careers 구조로 교체한 정책 v1과 활성 버전 v1을 저장한다")
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
        assertThat(policy.getValue().id()).isEqualTo("sk-policy-v2");
        assertThat(policy.getValue().companyKey()).isEqualTo("sk");
        assertThat(policy.getValue().version()).isEqualTo(3);
        assertThat(policy.getValue().preparationFingerprint().requiredSectionIds())
            .containsExactlyInAnyOrder(
                "section-1",
                "section-3",
                "section-4",
                "section-6"
            );
        assertThat(policy.getValue().actionRules())
            .extracting("structuralName")
            .contains(
                "prsMilitarySvcStatus",
                "대학 학력 정보 추가",
                "btnAddCareer",
                "btnAddCert"
            );
        assertThat(policy.getValue().fieldsFingerprint().requiredSectionIds())
            .containsExactlyInAnyOrder(
                "section-1",
                "section-3"
            );
        assertThat(policy.getValue().fieldRules())
            .extracting("structuralName", "profileFieldKey")
            .contains(
                org.assertj.core.groups.Tuple.tuple(
                    "prsEmail",
                    "contact.contact.email"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsPhone",
                    "contact.contact.phoneNumber"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsMilitarySvcStatus",
                    "military.military.militaryStatus"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "cerCertName",
                    "certifications.certificate.name"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "cerCertSource",
                    "certifications.certificate.issuer"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "eduEducationName",
                    "education.university.schoolName"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "eduEducationStatus",
                    "education.university.completionStatus"
                )
            );
        assertThat(company.getValue()).isEqualTo(new FormAnalysisCompanyDocument(
            "sk",
            "sk",
            "www.skcareers.com",
            java.util.List.of("/Application/Index/"),
            3
        ));
    }
}
