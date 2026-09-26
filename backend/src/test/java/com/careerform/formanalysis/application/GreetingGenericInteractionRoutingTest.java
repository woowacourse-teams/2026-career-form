package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

import com.careerform.formanalysis.application.FormAnalysisRouter.GenericRouteKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;

@DisplayName("Greeting의 범용 상호작용 진입 차단")
class GreetingGenericInteractionRoutingTest {

    private static final String APPLY_PATH = "/ko/o/*/apply";

    @ParameterizedTest
    @CsvSource({
        "kakaomobility.career.greetinghr.com, POSITIVE_STABLE",
        "career.hyundai-autoever.com, POSITIVE"
    })
    @DisplayName("기본 도메인과 자체 도메인의 Greeting 정책은 범용 상호작용을 차단한다")
    void greetingPolicyBlocksGenericInteraction(String host, Decision evidence) {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (candidateHost, path) -> new NotRegistered(),
            (candidateHost, path) -> evidence,
            () -> new Available(CompanyFormPolicyFixture.greeting())
        );

        assertThat(router.routeGeneric(host, APPLY_PATH))
            .isEqualTo(GenericRouteKind.STATIC_POLICY_PRESENT);
    }

    @ParameterizedTest
    @EnumSource(value = Decision.class, names = {"POSITIVE_STABLE", "POSITIVE"})
    @DisplayName("Greeting이 확인됐으나 정책을 읽을 수 없으면 범용으로 내리지 않는다")
    void unavailableGreetingPolicyFailsClosed(Decision evidence) {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> evidence,
            Unavailable::new
        );

        assertThat(router.routeGeneric("career.example.com", APPLY_PATH))
            .isEqualTo(GenericRouteKind.POLICY_UNAVAILABLE);
    }

    @Test
    @DisplayName("DNS 확인 실패 시 범용 상호작용을 차단한다")
    void dnsFailureFailsClosed() {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.RETRYABLE_FAILURE,
            () -> new Available(CompanyFormPolicyFixture.greeting())
        );

        assertThat(router.routeGeneric("career.example.com", APPLY_PATH))
            .isEqualTo(GenericRouteKind.POLICY_UNAVAILABLE);
    }

    @Test
    @DisplayName("기존 기업 정책은 Greeting DNS 확인 실패보다 우선한다")
    void existingCompanyPolicyTakesPriority() {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new Available(CompanyFormPolicyFixture.sk()),
            (host, path) -> Decision.RETRYABLE_FAILURE,
            Unavailable::new
        );

        assertThat(router.routeGeneric("recruit.sk.example", APPLY_PATH))
            .isEqualTo(GenericRouteKind.STATIC_POLICY_PRESENT);
    }

    @ParameterizedTest
    @EnumSource(value = Decision.class, names = {"NO_POSITIVE_EVIDENCE", "OUT_OF_SCOPE"})
    @DisplayName("Greeting 근거가 없는 일반 사이트는 기존 범용 경로를 유지한다")
    void unrelatedHostRemainsGeneric(Decision evidence) {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> evidence,
            Unavailable::new
        );

        assertThat(router.routeGeneric("jobs.example.com", APPLY_PATH))
            .isEqualTo(GenericRouteKind.GENERIC);
    }

    @Test
    @DisplayName("최근 양성 CNAME 근거가 사라져도 범용 상호작용으로 전환하지 않는다")
    void lostRecentPositiveEvidenceFailsClosed() {
        AtomicReference<Decision> evidence = new AtomicReference<>(Decision.POSITIVE);
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> evidence.get(),
            () -> new Available(CompanyFormPolicyFixture.greeting())
        );
        router.routeGeneric("career.example.com", APPLY_PATH);
        evidence.set(Decision.NO_POSITIVE_EVIDENCE);

        assertThat(router.routeGeneric("career.example.com", APPLY_PATH))
            .isEqualTo(GenericRouteKind.POLICY_UNAVAILABLE);
    }
}
