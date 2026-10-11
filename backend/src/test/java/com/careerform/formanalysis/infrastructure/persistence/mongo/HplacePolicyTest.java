package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.LookupResult;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.AutofillPolicy;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MappingStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchType;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WritePlan;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;

class HplacePolicyTest {
    @Test
    void persistedPolicyProducesOnlyThreeVerifiedTextBindingsAndNoPreparation() {
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        var document = ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);
        new LocalHplaceFormPolicySeeder(policies).run(null);
        verify(policies).save(document.capture());
        when(policies.findByCompanyKeyAndVersion("hplace", 1)).thenReturn(Optional.of(document.getValue()));
        var provider = new MongoHplacePolicyProvider(policies, new SupportedProfileFields(), 1);
        var router = new FormAnalysisRouter((host, path) -> new NotRegistered(),
            (host, path) -> Decision.NO_POSITIVE_EVIDENCE, Unavailable::new, provider);
        var prep = new PreparationAnalysisService(Optional.empty(), router).analyze(
            new PreparationAnalysisRequest(2, "prep", new PreparationAnalysisRequest.Site(
                "ahnlab.recruiter.co.kr", "/app/applicant/registResume"), List.of(
                    new PreparationAnalysisRequest.Section("hplace-registration", null, null, List.of(), null))));
        assertThat(prep.mode()).isEqualTo(PreparationAnalysisResponse.Mode.ADAPTER);
        assertThat(prep.preparationPlans()).isEmpty();
        var response = new FieldsAnalysisService(Optional.empty(), router,
            new FieldInteractionPolicy(), new SupportedProfileFields()).analyze(request());
        assertThat(response.mode()).isEqualTo(FieldsAnalysisResponse.Mode.ADAPTER);
        assertThat(response.analysisStatus()).isEqualTo(FieldsAnalysisResponse.AnalysisStatus.COMPLETE);
        assertThat(response.fields()).containsExactly(
            new MatchedFieldAnalysis("name", MatchType.MATCH, new DerivedBinding(DerivedRecipe.KOREAN_FULL_NAME),
                AutofillPolicy.ALLOWED, MappingStatus.ADAPTER_VERIFIED, InteractionStatus.READY, new WritePlan(WriteCommand.SET_TEXT)),
            new MatchedFieldAnalysis("mobile", MatchType.MATCH, new DirectBinding("contact.contact.phoneNumber"),
                AutofillPolicy.ALLOWED, MappingStatus.ADAPTER_VERIFIED, InteractionStatus.READY, new WritePlan(WriteCommand.SET_TEXT)),
            new MatchedFieldAnalysis("email", MatchType.MATCH, new DirectBinding("contact.contact.email"),
                AutofillPolicy.ALLOWED, MappingStatus.ADAPTER_VERIFIED, InteractionStatus.READY, new WritePlan(WriteCommand.SET_TEXT)));
    }

    @Test
    void missingInvalidOrFailedPolicyCannotFallBackToGeneric() {
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        when(policies.findByCompanyKeyAndVersion("hplace", 1)).thenReturn(Optional.empty())
            .thenThrow(new IllegalStateException("synthetic-private-error"));
        var provider = new MongoHplacePolicyProvider(policies, new SupportedProfileFields(), 1);
        assertThat(provider.find()).isInstanceOf(Unavailable.class);
        assertThat(provider.find()).isInstanceOf(Unavailable.class);
        assertThat(new MongoHplacePolicyProvider(policies, new SupportedProfileFields(), 0).find())
            .isInstanceOf(Unavailable.class);
        when(policies.findByCompanyKeyAndVersion("hplace", 2)).thenReturn(Optional.of(HplaceCompanyFormPolicyFactory.create()));
        assertThat(new MongoHplacePolicyProvider(policies, new SupportedProfileFields(), 2).find())
            .isInstanceOf(Unavailable.class);
    }

    @Test
    void hplaceRequiresNamedSectionsAndOtherCompaniesStillCannotHaveNoPreparation() {
        var document = HplaceCompanyFormPolicyFactory.create();
        assertThatThrownBy(() -> CompanyFormPolicy.create("hplace", 1, document.preparationFingerprint(),
            CompanyFormPolicy.FieldsFingerprint.anySections(document.fieldsFingerprint().requiredFields()),
            List.of(), document.fieldRules(), new SupportedProfileFields()::contains)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CompanyFormPolicy.create("unverified", 1, document.preparationFingerprint(),
            document.fieldsFingerprint(), List.of(), document.fieldRules(), new SupportedProfileFields()::contains))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ahnlab.recruiter.co.kr", "other.recruiter.im", "AHNLAB.RECRUITER.CO.KR"})
    void tenantRegistrationCannotBypassPolicyUsingGenericEndpoint(String host) {
        var router = router(new Available(policy()));
        assertThat(router.routeGeneric(host, "/app/applicant/registResume"))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.STATIC_POLICY_PRESENT);
        assertThat(router.routeGeneric(host, "/app/applicant/login"))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.POLICY_UNAVAILABLE);
    }

    @Test
    void registeredCompanyStillHasPriority() {
        var router = new FormAnalysisRouter((host, path) -> new Available(policy()),
            (host, path) -> { throw new AssertionError("must not use greeting fallback"); },
            () -> { throw new AssertionError("must not use greeting policy"); },
            () -> { throw new AssertionError("must not use hplace fallback"); });
        assertThat(router.route(request()).kind()).isEqualTo(FormAnalysisRouter.RouteKind.ADAPTER);
        assertThat(router.routeGeneric("ahnlab.recruiter.co.kr", "/app/applicant/registResume"))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.STATIC_POLICY_PRESENT);
    }

    @Test
    void sharedProviderNotRegisteredIsStillUnavailable() {
        assertThat(router(new NotRegistered()).route(request()).kind())
            .isEqualTo(FormAnalysisRouter.RouteKind.POLICY_UNAVAILABLE);
        assertThat(router(new NotRegistered()).routeGeneric("ahnlab.recruiter.co.kr", "/app/applicant/registResume"))
            .isEqualTo(FormAnalysisRouter.GenericRouteKind.POLICY_UNAVAILABLE);
    }

    @Test
    void availablePolicyDoesNotAcceptMalformedRegistrationShape() {
        var request = request();
        var invalid = new FieldsAnalysisRequest(2, "fields", request.site(),
            List.of(new Section("other", null, null, request.sections().getFirst().fields(), null)));
        assertThat(router(new Available(policy())).route(invalid).kind())
            .isEqualTo(FormAnalysisRouter.RouteKind.STRUCTURE_MISMATCH);
    }

    private static FormAnalysisRouter router(LookupResult lookup) {
        return new FormAnalysisRouter((host, path) -> new NotRegistered(),
            (host, path) -> Decision.NO_POSITIVE_EVIDENCE, Unavailable::new, () -> lookup);
    }

    private static CompanyFormPolicy policy() {
        var document = HplaceCompanyFormPolicyFactory.create();
        return CompanyFormPolicy.create(document.companyKey(), document.version(), document.preparationFingerprint(),
            document.fieldsFingerprint(), document.actionRules(), document.fieldRules(), new SupportedProfileFields()::contains);
    }

    private static FieldsAnalysisRequest request() {
        return new FieldsAnalysisRequest(2, "fields", new Site("ahnlab.recruiter.co.kr", "/app/applicant/registResume"),
            List.of(new Section("hplace-registration", null, null, List.of(field("name"), field("mobile"), field("email")), null)));
    }

    private static FieldCandidate field(String key) {
        return new FieldCandidate(key, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
            null, "hplace.registration." + key, "hplace.registration." + key, null, null, null, null, null);
    }
}
