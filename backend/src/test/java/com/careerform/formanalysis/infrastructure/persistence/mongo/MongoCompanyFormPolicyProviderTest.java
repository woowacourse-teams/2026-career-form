package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@DisplayName("MongoDB 회사별 지원서 정책 조회")
class MongoCompanyFormPolicyProviderTest {

    private FormAnalysisCompanyMongoRepository companies;
    private FormAnalysisPolicyMongoRepository policies;
    private MongoCompanyFormPolicyProvider provider;

    @BeforeEach
    void setUp() {
        companies = mock(FormAnalysisCompanyMongoRepository.class);
        policies = mock(FormAnalysisPolicyMongoRepository.class);
        provider = new MongoCompanyFormPolicyProvider(
            companies,
            policies,
            new SupportedProfileFields()
        );
    }

    @Test
    @DisplayName("등록되지 않은 host 또는 path는 generic 대상이다")
    void reportsAnUnregisteredSite() {
        when(companies.findByHost("unknown.example")).thenReturn(Optional.empty());

        assertThat(provider.find("unknown.example", "/application/*"))
            .isInstanceOf(NotRegistered.class);

        when(companies.findByHost("www.skcareers.com"))
            .thenReturn(Optional.of(company()));

        assertThat(provider.find("www.skcareers.com", "/Other/Page/*"))
            .isInstanceOf(NotRegistered.class);
    }

    @Test
    @DisplayName("정규화한 host와 path로 회사의 활성 정책 버전을 조회한다")
    void loadsTheActivePolicyForTheRegisteredSite() {
        when(companies.findByHost("www.skcareers.com"))
            .thenReturn(Optional.of(company()));
        when(policies.findByCompanyKeyAndVersion("sk", 2))
            .thenReturn(Optional.of(policy(2, "contact.contact.email")));

        Object result = provider.find(
            "WWW.SKCAREERS.COM.",
            "/Recruit/Apply/{postingId}"
        );

        assertThat(result).isInstanceOfSatisfying(Available.class, available -> {
            assertThat(available.policy().companyKey()).isEqualTo("sk");
            assertThat(available.policy().version()).isEqualTo(2);
            assertThat(available.policy().fieldRules().getFirst().profileFieldKey())
                .isEqualTo("contact.contact.email");
        });
    }

    @Test
    @DisplayName("MongoDB 조회 실패는 정책 사용 불가로 닫는다")
    void blocksWhenMongoDbLookupFails() {
        when(companies.findByHost("www.skcareers.com"))
            .thenThrow(new DataAccessResourceFailureException("synthetic-db-failure"));

        assertThat(provider.find(
            "www.skcareers.com",
            "/Recruit/Apply/{postingId}"
        )).isInstanceOf(Unavailable.class);
    }

    @Test
    @DisplayName("활성 버전 문서가 없으면 정책 사용 불가로 닫는다")
    void blocksWhenTheActivePolicyDocumentIsMissing() {
        when(companies.findByHost("www.skcareers.com"))
            .thenReturn(Optional.of(company()));
        when(policies.findByCompanyKeyAndVersion("sk", 2))
            .thenReturn(Optional.empty());

        assertThat(provider.find(
            "www.skcareers.com",
            "/Recruit/Apply/{postingId}"
        )).isInstanceOf(Unavailable.class);
    }

    @Test
    @DisplayName("유효하지 않은 활성 정책 문서는 정책 사용 불가로 닫는다")
    void blocksAnInvalidActivePolicyDocument() {
        when(companies.findByHost("www.skcareers.com"))
            .thenReturn(Optional.of(company()));
        when(policies.findByCompanyKeyAndVersion("sk", 2))
            .thenReturn(Optional.of(policy(2, "invalid.profile.field")));

        assertThat(provider.find(
            "www.skcareers.com",
            "/Recruit/Apply/{postingId}"
        )).isInstanceOf(Unavailable.class);
    }

    private static FormAnalysisCompanyDocument company() {
        return new FormAnalysisCompanyDocument(
            "form-analysis-company:sk",
            "sk",
            "www.skcareers.com",
            List.of("/Recruit/Apply/"),
            2
        );
    }

    private static FormAnalysisPolicyDocument policy(
        long version,
        String profileFieldKey
    ) {
        return new FormAnalysisPolicyDocument(
            "form-analysis-policy:sk:" + version,
            "sk",
            version,
            new PreparationFingerprint(
                Set.of("section-profile", "section-detail"),
                List.of(new ActionStructure(
                    "detail-toggle",
                    PreparationAnalysisRequest.FormElement.BUTTON,
                    PreparationAnalysisRequest.FormControl.BUTTON
                ))
            ),
            new FieldsFingerprint(
                Set.of("section-profile"),
                List.of(new FieldStructure(
                    "applicant-email",
                    FieldsAnalysisRequest.FormElement.INPUT,
                    FieldsAnalysisRequest.FormControl.TEXT
                ))
            ),
            List.of(new ActionRule(
                "detail-toggle",
                ActionKind.REVEAL,
                "section-detail"
            )),
            List.of(new FieldRule(
                "applicant-email",
                FieldsAnalysisRequest.FormElement.INPUT,
                FieldsAnalysisRequest.FormControl.TEXT,
                profileFieldKey
            ))
        );
    }
}
