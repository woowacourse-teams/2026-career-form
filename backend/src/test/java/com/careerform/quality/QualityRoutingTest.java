package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.AnalysisRouteObserver;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;

import tools.jackson.databind.ObjectMapper;

@DisplayName("실제 선택한 분석 경로의 품질 관측")
class QualityRoutingTest {

    @Test
    @DisplayName("정적 정책과 Greeting 공통 정책을 실제 router 결과에서 구분한다")
    void recordsStaticAndGreetingWithPolicyVersion() throws Exception {
        try (var scope = QualityScope.open()) {
            var router = router((host, path) -> new CompanyFormPolicyProvider.Available(CompanyFormPolicyFixture.sk()),
                GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE);
            assertThat(router.route(request("sk-fields-current-v2.json")).kind())
                .isEqualTo(FormAnalysisRouter.RouteKind.ADAPTER);
            var decision = scope.decision().orElseThrow();
            assertThat(decision.greeting()).isFalse();
            assertThat(decision.companyKey()).isEqualTo("sk");
            assertThat(decision.policyVersion()).isEqualTo(3L);
        }
        try (var scope = QualityScope.open()) {
            var router = router((host, path) -> new CompanyFormPolicyProvider.NotRegistered(),
                GreetingDomainEvidence.Decision.POSITIVE);
            assertThat(router.route(request("greeting-fields-current-v2.json")).kind())
                .isEqualTo(FormAnalysisRouter.RouteKind.ADAPTER);
            assertThat(scope.decision().orElseThrow().greeting()).isTrue();
            assertThat(scope.decision().orElseThrow().companyKey()).isEqualTo("greeting");
        }
    }

    @Test
    @DisplayName("범용 경로와 구조 불일치를 혼동하지 않는다")
    void recordsGenericAndBlockedWithoutFallback() throws Exception {
        try (var scope = QualityScope.open()) {
            var generic = router((host, path) -> new CompanyFormPolicyProvider.NotRegistered(),
                GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE);
            generic.route(request("sk-fields-current-v2.json"));
            assertThat(scope.decision().orElseThrow().kind()).isEqualTo(FormAnalysisRouter.RouteKind.GENERIC);
            assertThat(scope.decision().orElseThrow().policyVersion()).isNull();
        }
        try (var scope = QualityScope.open()) {
            var registered = router((host, path) -> new CompanyFormPolicyProvider.Available(CompanyFormPolicyFixture.sk()),
                GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE);
            var routed = registered.route(request("sk-fields-structure-mismatch-v2.json"));
            assertThat(routed.kind()).isEqualTo(FormAnalysisRouter.RouteKind.STRUCTURE_MISMATCH);
            assertThat(scope.decision().orElseThrow().kind()).isEqualTo(routed.kind());
        }
        assertThat(QualityScope.current()).isEmpty();
    }

    @Test
    @DisplayName("품질 관측 실패가 기존 route 선택을 변경하지 않는다")
    void ignoresObserverFailureAndRestoresNestedScope() throws Exception {
        var router = new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered(),
            (host, path) -> GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE,
            CompanyFormPolicyProvider.Unavailable::new,
            Optional.of((AnalysisRouteObserver) decision -> { throw new IllegalStateException("synthetic-only"); }));

        assertThat(router.route(request("sk-fields-current-v2.json")).kind())
            .isEqualTo(FormAnalysisRouter.RouteKind.GENERIC);
        try (var outer = QualityScope.open()) {
            router((host, path) -> new CompanyFormPolicyProvider.NotRegistered(),
                GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE).route(request("sk-fields-current-v2.json"));
            var prior = outer.decision();
            try (var inner = QualityScope.open()) {
                assertThat(inner.decision()).isEmpty();
            }
            assertThat(QualityScope.current().orElseThrow().decision()).isEqualTo(prior);
        }
    }

    @Test
    void preservesGreetingEvidenceWhenInteractionPolicyIsUnavailable() {
        var router = new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered(),
            (host, path) -> GreetingDomainEvidence.Decision.POSITIVE, CompanyFormPolicyProvider.Unavailable::new,
            Optional.of((AnalysisRouteObserver) QualityScope::record));
        try (var scope = QualityScope.open()) {
            assertThat(router.routeGeneric("sample.career.greetinghr.com", "/apply"))
                .isEqualTo(FormAnalysisRouter.GenericRouteKind.POLICY_UNAVAILABLE);
            assertThat(scope.decision().orElseThrow().greeting()).isTrue();
        }
    }

    private FormAnalysisRouter router(CompanyFormPolicyProvider policies, GreetingDomainEvidence.Decision evidence) {
        return new FormAnalysisRouter(policies, (host, path) -> evidence,
            () -> new CompanyFormPolicyProvider.Available(CompanyFormPolicyFixture.greeting()),
            Optional.of((AnalysisRouteObserver) QualityScope::record));
    }

    private FieldsAnalysisRequest request(String fixture) throws Exception {
        try (var input = new ClassPathResource("formanalysis/" + fixture).getInputStream()) {
            return new ObjectMapper().readValue(input, FieldsAnalysisRequest.class);
        }
    }
}
