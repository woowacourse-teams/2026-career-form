package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import com.careerform.formanalysis.dto.InteractionDecisionResponse;

import tools.jackson.databind.ObjectMapper;

class ResultInteractionContractTest {
    @ParameterizedTest
    @ValueSource(strings = {"CONTAINER", "ITEM", "ACTION"})
    void acceptsFiniteResultStructuresWithoutResultData(String kind) {
        String control = kind.equals("ACTION") ? "button" : kind.toLowerCase();
        String json = """
            {"schemaVersion":2,"snapshotId":"local-snapshot","site":{"host":"example.test","pathPattern":"/apply"},
            "decisions":[{"decisionId":"shape","role":"SEARCH_RESULT_%s",
            "canonicalFieldKey":"education.university.schoolName","candidates":[{
            "candidateId":"local-shape","element":"custom","control":"%s","visibility":"visible",
            "relationToTarget":"DIALOG_CONTROL","structure":{"tag":"div","ariaRole":"none",
            "activation":"inline-click","depth":1,"childCount":0}}]}]}
            """.formatted(kind, control);
        ObjectMapper mapper = new ObjectMapper();
        InteractionDecisionRequest request = mapper.readValue(json, InteractionDecisionRequest.class);
        InteractionDecisionService service = new InteractionDecisionService(Optional.of(batch -> {
            assertThat(mapper.writeValueAsString(batch)).contains("inline-click")
                .doesNotContain("local-snapshot", "example.test", "local-shape");
            return new InteractionDecisionProvider.Resolution(2, batch.decisions().stream()
                .map(d -> (InteractionDecisionProvider.Result) new InteractionDecisionProvider.Selected(
                    d.decisionId(), d.role(), d.candidates().getFirst().candidateId())).toList());
        }), new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new InteractionObservationProjector());
        assertThat(service.decide(request).status()).isEqualTo(InteractionDecisionResponse.Status.COMPLETE);
    }
}
