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
    @ValueSource(strings = {"/app/applicant/login", "/app/applicant/writeResume", "/app/applicant/registResume/"})
    void otherApplicantPagesStayClosed(String path) {
        var router = new FormAnalysisRouter((host, route) -> new CompanyFormPolicyProvider.NotRegistered());
        assertThat(router.routeGeneric("ahnlab.recruiter.co.kr", path))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.POLICY_UNAVAILABLE);
    }

    @Test
    void resumeFormStaysClosedWithoutTheV1Policy() {
        var router = new FormAnalysisRouter((host, route) -> new CompanyFormPolicyProvider.NotRegistered());
        assertThat(router.routeGeneric("ahnlab.recruiter.co.kr", "/v1/applicant/resume-form/*"))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.POLICY_UNAVAILABLE);
        assertThat(router.route(resumeForm("hplace-v1-basic")).kind()).isEqualTo(FormAnalysisRouter.RouteKind.POLICY_UNAVAILABLE);
    }

    @Test
    void resumeFormWithoutTheV1SectionIsNeverAnAdapterOrGenericRoute() {
        var router = new FormAnalysisRouter((host, route) -> new CompanyFormPolicyProvider.NotRegistered(),
            (host, route) -> com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE,
            CompanyFormPolicyProvider.Unavailable::new,
            new com.careerform.formanalysis.infrastructure.persistence.mongo.MongoHplacePolicyProvider(
                org.mockito.Mockito.mock(com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisPolicyMongoRepository.class),
                new SupportedProfileFields(), 4));
        assertThat(router.routeGeneric("ahnlab.recruiter.co.kr", "/v1/applicant/resume-form/*"))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.STATIC_POLICY_PRESENT);
        assertThat(router.route(resumeForm("hplace-detail-basic")).kind()).isEqualTo(FormAnalysisRouter.RouteKind.STRUCTURE_MISMATCH);
        assertThat(router.route(resumeForm("hplace-v1-basic")).kind()).isEqualTo(FormAnalysisRouter.RouteKind.ADAPTER);
    }

    private static com.careerform.formanalysis.dto.FieldsAnalysisRequest resumeForm(String section) {
        String name = section.equals("hplace-v1-basic") ? "hplace.v1.birthday" : "hplace.detail.birthday";
        return new com.careerform.formanalysis.dto.FieldsAnalysisRequest(2, "fields",
            new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site("ahnlab.recruiter.co.kr", "/v1/applicant/resume-form/*"),
            java.util.List.of(new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section(section, null, null, java.util.List.of(
                new com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate("birthday",
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility.VISIBLE,
                    null, name, name, null, null, null, null, null)), null)));
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
