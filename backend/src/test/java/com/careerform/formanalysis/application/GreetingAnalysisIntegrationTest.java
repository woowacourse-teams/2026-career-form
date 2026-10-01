package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.AutofillPolicy;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MappingStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchType;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.NoMatchFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.ReasonCode;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WritePlan;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;

import tools.jackson.databind.ObjectMapper;

@DisplayName("Greeting 준비 응답에서 필드 분석까지의 서비스 통합")
class GreetingAnalysisIntegrationTest {

    @ParameterizedTest
    @ValueSource(strings = {
        "kakaomobility.career.greetinghr.com",
        "career.hyundai-autoever.com"
    })
    @DisplayName("기존 요청으로 준비와 필드 매핑을 각각 검증한다")
    void mapsKnownSitesUsingIndependentRequests(String host)
        throws Exception {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (candidateHost, path) -> new NotRegistered(),
            (candidateHost, path) -> Decision.POSITIVE,
            () -> new Available(CompanyFormPolicyFixture.greeting())
        );
        PreparationAnalysisService preparationService = new PreparationAnalysisService(
            Optional.empty(), router
        );
        FieldsAnalysisService fieldsService = new FieldsAnalysisService(
            Optional.empty(), router, new FieldInteractionPolicy(), new SupportedProfileFields()
        );
        ObjectMapper mapper = new ObjectMapper();
        PreparationAnalysisRequest preparationFixture = mapper.readValue(
            fixture("greeting-preparation-current-v2.json"), PreparationAnalysisRequest.class
        );
        PreparationAnalysisRequest preparationRequest = new PreparationAnalysisRequest(
            2, "synthetic-preparation",
            new PreparationAnalysisRequest.Site(host, "/ko/o/*/apply"),
            preparationFixture.sections()
        );

        PreparationAnalysisResponse preparation = preparationService.analyze(
            preparationRequest
        );

        assertThat(preparation.mode()).isEqualTo(PreparationAnalysisResponse.Mode.ADAPTER);
        assertThat(preparation.analysisStatus())
            .isEqualTo(PreparationAnalysisResponse.AnalysisStatus.COMPLETE);
        assertThat(preparation.preparationPlans()).isEmpty();

        FieldsAnalysisRequest fieldsFixture = mapper.readValue(
            fixture("greeting-fields-current-v2.json"), FieldsAnalysisRequest.class
        );
        FieldsAnalysisRequest fieldsRequest = new FieldsAnalysisRequest(
            2, "synthetic-fields", new FieldsAnalysisRequest.Site(host, "/ko/o/*/apply"),
            fieldsFixture.sections()
        );

        FieldsAnalysisResponse fields = fieldsService.analyze(fieldsRequest);

        assertThat(fields.snapshotId()).isEqualTo("synthetic-fields");
        assertThat(fields.mode()).isEqualTo(FieldsAnalysisResponse.Mode.ADAPTER);
        assertThat(fields.analysisStatus()).isEqualTo(FieldsAnalysisResponse.AnalysisStatus.COMPLETE);
        assertThat(fields.blockCode()).isNull();
        assertThat(fields.fields()).containsExactly(
            new MatchedFieldAnalysis(
                "name", MatchType.MATCH, new DerivedBinding(DerivedRecipe.KOREAN_FULL_NAME),
                AutofillPolicy.ALLOWED, MappingStatus.ADAPTER_VERIFIED, InteractionStatus.READY,
                new WritePlan(WriteCommand.SET_TEXT)
            ),
            new MatchedFieldAnalysis(
                "phone", MatchType.MATCH, new DirectBinding("contact.contact.phoneNumber"),
                AutofillPolicy.ALLOWED, MappingStatus.ADAPTER_VERIFIED, InteractionStatus.READY,
                new WritePlan(WriteCommand.SET_TEXT)
            ),
            new NoMatchFieldAnalysis(
                "school-search", MatchType.NO_MATCH, MappingStatus.ADAPTER_VERIFIED,
                InteractionStatus.BLOCKED, List.of(ReasonCode.NO_MATCH)
            )
        );
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}
