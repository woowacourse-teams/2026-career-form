package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;

import tools.jackson.databind.ObjectMapper;

@DisplayName("저장 정책 기반 지원서 분석 route")
class StoredPolicyRoutingTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("미등록 회사는 generic route로 보낸다")
    void routesAnUnregisteredCompanyToGeneric() throws Exception {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new NotRegistered()
        );

        assertThat(router.route(preparation("sk-preparation-current-v2.json")).kind())
            .isEqualTo(RouteKind.GENERIC);
        assertThat(router.route(fields("sk-fields-current-v2.json")).kind())
            .isEqualTo(RouteKind.GENERIC);
    }

    @Test
    @DisplayName("활성 정책과 fingerprint가 맞으면 adapter route로 보낸다")
    void routesAVerifiedActivePolicyToAdapter() throws Exception {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new Available(CompanyFormPolicyFixture.sk())
        );

        assertThat(router.route(preparation("sk-preparation-current-v2.json")).kind())
            .isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(fields("sk-fields-current-v2.json")).kind())
            .isEqualTo(RouteKind.ADAPTER);
    }

    @Test
    @DisplayName("등록 회사의 구조 불일치와 정책 조회 실패를 구분한다")
    void distinguishesMismatchFromUnavailablePolicy() throws Exception {
        FormAnalysisRouter available = new FormAnalysisRouter(
            (host, path) -> new Available(CompanyFormPolicyFixture.sk())
        );
        FormAnalysisRouter unavailable = new FormAnalysisRouter(
            (host, path) -> new Unavailable()
        );

        assertThat(available.route(preparation(
            "sk-preparation-structure-mismatch-v2.json"
        )).kind()).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
        assertThat(available.route(fields(
            "sk-fields-structure-mismatch-v2.json"
        )).kind()).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
        assertThat(unavailable.route(preparation(
            "sk-preparation-current-v2.json"
        )).kind()).isEqualTo(RouteKind.POLICY_UNAVAILABLE);
        assertThat(unavailable.route(fields(
            "sk-fields-current-v2.json"
        )).kind()).isEqualTo(RouteKind.POLICY_UNAVAILABLE);
    }

    @Test
    @DisplayName("기존 회사가 먼저 적용되고, Greeting 연결 증거가 없으면 범용으로 유지한다")
    void preservesCompanyPriorityAndNoEvidenceGenericFallback() throws Exception {
        FormAnalysisRouter company = new FormAnalysisRouter(
            (host, path) -> new Available(CompanyFormPolicyFixture.sk()),
            (host, path) -> { throw new AssertionError("registered company must win"); },
            () -> { throw new AssertionError("registered company must win"); }
        );
        assertThat(company.route(preparation("sk-preparation-current-v2.json")).kind())
            .isEqualTo(RouteKind.ADAPTER);

        FormAnalysisRouter noEvidence = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.NO_POSITIVE_EVIDENCE,
            () -> { throw new AssertionError("no positive evidence"); }
        );
        assertThat(noEvidence.route(preparation("sk-preparation-current-v2.json")).kind())
            .isEqualTo(RouteKind.GENERIC);
    }

    @Test
    @DisplayName("Greeting 연결 확인 뒤 정책 부재와 DNS 오류는 범용으로 낮추지 않는다")
    void blocksConfirmedGreetingWithoutPolicyAndRetryableDnsFailure() throws Exception {
        FormAnalysisRouter confirmed = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.POSITIVE,
            Unavailable::new
        );
        FormAnalysisRouter dnsFailure = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.RETRYABLE_FAILURE,
            () -> { throw new AssertionError("DNS failure must not load a policy"); }
        );

        assertThat(confirmed.route(preparation("sk-preparation-current-v2.json")).kind())
            .isEqualTo(RouteKind.POLICY_UNAVAILABLE);
        assertThat(dnsFailure.route(fields("sk-fields-current-v2.json")).kind())
            .isEqualTo(RouteKind.DNS_UNAVAILABLE);

        PreparationAnalysisResponse response = new PreparationAnalysisService(
            Optional.empty(), dnsFailure
        ).analyze(preparation("sk-preparation-current-v2.json"));
        assertThat(response.mode()).isEqualTo(PreparationAnalysisResponse.Mode.ADAPTER);
        assertThat(response.analysisStatus())
            .isEqualTo(PreparationAnalysisResponse.AnalysisStatus.BLOCKED);
        assertThat(response.blockCode())
            .isEqualTo(PreparationAnalysisResponse.BlockCode.GREETING_DNS_UNAVAILABLE);
    }

    private PreparationAnalysisRequest preparation(String name) throws Exception {
        return objectMapper.readValue(fixture(name), PreparationAnalysisRequest.class);
    }

    private FieldsAnalysisRequest fields(String name) throws Exception {
        return objectMapper.readValue(fixture(name), FieldsAnalysisRequest.class);
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}
