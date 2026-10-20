package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;

class FormAnalysisRouterTest {
    @Test
    void registrationWithoutItsSharedPolicyCannotUseGenericAnalysis() {
        var router = new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered());
        assertThat(router.routeGeneric("ahnlab.recruiter.co.kr", "/app/applicant/registResume"))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.POLICY_UNAVAILABLE);
    }
    @ParameterizedTest
    @ValueSource(strings = {"/app/applicant/login", "/app/applicant/writeResume", "/app/applicant/registResume/", "/v1/applicant/resume-form/*"})
    void otherApplicantPagesStayClosed(String path) {
        var router = new FormAnalysisRouter((host, route) -> new CompanyFormPolicyProvider.NotRegistered());
        assertThat(router.routeGeneric("ahnlab.recruiter.co.kr", path))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.POLICY_UNAVAILABLE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"recruiter.co.kr", "evil.ahnlab.recruiter.co.kr", "ahnlab.recruiter.co.kr.evil.test", "ahnlab.recruiter.co.kr:443", "-bad.recruiter.im"})
    void doesNotClassifySpoofedHosts(String host) {
        var router = new FormAnalysisRouter((candidate, path) -> new CompanyFormPolicyProvider.NotRegistered());
        assertThat(router.routeGeneric(host, "/app/applicant/registResume"))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.GENERIC);
    }

    @Test
    void publicHomeRetainsItsExistingRoute() {
        var router = new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered());
        assertThat(router.routeGeneric("ahnlab.recruiter.co.kr", "/career/jobs/*"))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.GENERIC);
    }
}
