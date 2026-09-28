package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.FormAnalysisRouter.GenericRouteKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;

class GreetingGenericInteractionRoutingTest {
    private static final String APPLY_PATH = "/ko/o/*/apply";

    @ParameterizedTest
    @ValueSource(strings = {"kakaomobility.career.greetinghr.com", "career.hyundai-autoever.com", "www.musinsacareers.com"})
    void greetingPolicyBlocksGenericInteraction(String host) {
        var router = new FormAnalysisRouter((h, p) -> new NotRegistered(), (h, p) -> Decision.POSITIVE,
            () -> new Available(CompanyFormPolicyFixture.greeting()));
        assertThat(router.routeGeneric(host, APPLY_PATH)).isEqualTo(GenericRouteKind.STATIC_POLICY_PRESENT);
    }

    @Test
    void unavailableGreetingPolicyFailsClosed() {
        var router = new FormAnalysisRouter((h, p) -> new NotRegistered(), (h, p) -> Decision.POSITIVE, Unavailable::new);
        assertThat(router.routeGeneric("career.hyundai-autoever.com", APPLY_PATH))
            .isEqualTo(GenericRouteKind.POLICY_UNAVAILABLE);
    }

    @Test
    void existingCompanyPolicyTakesPriority() {
        var router = new FormAnalysisRouter((h, p) -> new Available(CompanyFormPolicyFixture.sk()),
            (h, p) -> { throw new AssertionError("existing policy must win"); },
            () -> { throw new AssertionError("registered company must win"); });
        assertThat(router.routeGeneric("career.hyundai-autoever.com", APPLY_PATH))
            .isEqualTo(GenericRouteKind.STATIC_POLICY_PRESENT);
    }

    @Test
    void missingEvidenceRemainsGeneric() {
        var router = new FormAnalysisRouter((h, p) -> new NotRegistered(),
            (h, p) -> Decision.NO_POSITIVE_EVIDENCE,
            () -> { throw new AssertionError("no evidence must not load Greeting policy"); });
        assertThat(router.routeGeneric("new-customer.example.org", APPLY_PATH)).isEqualTo(GenericRouteKind.GENERIC);
    }

    @Test
    void dnsFailureBlocksGenericInteraction() {
        var router = new FormAnalysisRouter((h, p) -> new NotRegistered(),
            (h, p) -> Decision.RETRYABLE_FAILURE, Unavailable::new);
        assertThat(router.routeGeneric("new-customer.example.org", APPLY_PATH))
            .isEqualTo(GenericRouteKind.POLICY_UNAVAILABLE);
    }
}
