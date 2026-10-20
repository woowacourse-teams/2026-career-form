package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import com.careerform.formanalysis.dto.InteractionDecisionResponse;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.TargetKind;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevInteractionDecisionProvider;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class StructureInteractionDecisionContractTest {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final Map<TargetKind, String> OPTION_LABELS = Map.of(
        TargetKind.HIGH_SCHOOL, "고등학교 졸업 SYNTHETIC_NAME_7310",
        TargetKind.ASSOCIATE, "전문학사 2019.03",
        TargetKind.BACHELOR, "학사 (4년제)",
        TargetKind.MASTER, "석사 3건 SYNTHETIC_NAME_7310",
        TargetKind.DOCTOR, "PhD 박사");
    private static final Map<TargetKind, String> MASKED_LABELS = Map.of(
        TargetKind.HIGH_SCHOOL, "고등학교 졸업 SYNTHETIC_NAME_<number>",
        TargetKind.ASSOCIATE, "전문학사 <number>.<number>",
        TargetKind.BACHELOR, "학사 (4년제)",
        TargetKind.MASTER, "석사 3건 SYNTHETIC_NAME_<number>",
        TargetKind.DOCTOR, "PhD 박사");

    @Test
    void roundTripsEveryRowKindTargetWithMaskedRawOptionLabels() {
        String json = """
            {"schemaVersion":2,"snapshotId":"row-kind-snapshot","site":{"host":"example.test","pathPattern":"/apply"},
            "decisions":[%s]}
            """.formatted(String.join(",", Arrays.stream(TargetKind.values()).map(kind -> """
            {"decisionId":"kind-%1$s","role":"ROW_KIND_OPTION","targetKind":"%2$s",
            "canonicalFieldKey":"education.university.schoolName","candidates":[%3$s]}
            """.formatted(kind.ordinal(), kind.name(), String.join(",", Arrays.stream(TargetKind.values())
                .map(option -> """
                {"candidateId":"opt-%1$s-%2$s","element":"select","control":"option","visibility":"visible",
                "relationToTarget":"SAME_REPEAT_ROW","semanticContext":{"labels":[{"source":"label","text":"%3$s"}]}}
                """.formatted(kind.ordinal(), option.name().toLowerCase(), OPTION_LABELS.get(option))).toList())))
                .toList()));
        InteractionDecisionRequest request = MAPPER.readValue(json, InteractionDecisionRequest.class);
        AtomicReference<String> captured = new AtomicReference<>();
        JevClient client = mock(JevClient.class);
        when(client.choose(any(), any())).thenAnswer(invocation -> {
            Object state = invocation.getArgument(0);
            Map<String, JevClient.Choice> questions = invocation.getArgument(1);
            captured.set(MAPPER.writeValueAsString(Map.of("state", state, "questions", questions)));
            JsonNode tree = MAPPER.valueToTree(state);
            Map<String, String> answers = new LinkedHashMap<>();
            questions.forEach((id, question) -> {
                TargetKind kind = Arrays.stream(TargetKind.values())
                    .filter(candidate -> question.instructions().contains(" " + candidate.name() + "."))
                    .findFirst().orElseThrow();
                answers.put(id, JevClient.ABSTAIN);
                for (JsonNode candidate : tree.get(id).get("candidates")) {
                    if (candidate.get("labels").get(0).get("text").asString().equals(MASKED_LABELS.get(kind))) {
                        answers.put(id, candidate.get("candidateId").asString());
                    }
                }
            });
            return answers;
        });

        InteractionDecisionResponse response = service(client).decide(request);

        assertThat(response.status()).isEqualTo(InteractionDecisionResponse.Status.COMPLETE);
        assertThat(response.decisions()).extracting(InteractionDecisionResponse.Decision::candidateId)
            .containsExactly("opt-0-high_school", "opt-1-associate", "opt-2-bachelor", "opt-3-master",
                "opt-4-doctor");
        assertThat(captured.get()).contains("HIGH_SCHOOL", "ASSOCIATE", "BACHELOR", "MASTER", "DOCTOR",
            "SYNTHETIC_NAME_<number>", "3건", "4년제")
            .doesNotContain("SYNTHETIC_NAME_7310", "2019", "opt-", "kind-", "row-kind-snapshot",
                "example.test", "\"value", "profile", "count");
    }

    @Test
    void asksRepeatAddThroughJevWithMaskedRawLabels() {
        String json = """
            {"schemaVersion":2,"snapshotId":"repeat-snapshot","site":{"host":"example.test","pathPattern":"/apply"},
            "decisions":[{"decisionId":"add-row","role":"REPEAT_ADD","canonicalFieldKey":"careers.career.companyName",
            "candidates":[{"candidateId":"add-button","element":"button","control":"button","visibility":"visible",
            "relationToTarget":"SAME_CONTAINER","semanticContext":{"labels":[{"source":"label",
            "text":"경력 추가 SYNTHETIC_COMPANY_5521"}]}}]}]}
            """;
        AtomicReference<String> captured = new AtomicReference<>();
        JevClient client = mock(JevClient.class);
        when(client.choose(any(), any())).thenAnswer(invocation -> {
            captured.set(MAPPER.writeValueAsString(Map.of("state", invocation.getArgument(0),
                "questions", invocation.getArgument(1))));
            Map<String, JevClient.Choice> questions = invocation.getArgument(1);
            return Map.of(questions.keySet().iterator().next(), "c1_1");
        });

        InteractionDecisionResponse response = service(client)
            .decide(MAPPER.readValue(json, InteractionDecisionRequest.class));

        assertThat(response.decisions()).containsExactly(InteractionDecisionResponse.Decision.selected(
            "add-row", InteractionDecisionRequest.Role.REPEAT_ADD, "add-button"));
        assertThat(captured.get()).contains("REPEAT_ADD", "ADD:", "경력 추가 SYNTHETIC_COMPANY_<number>")
            .doesNotContain("SYNTHETIC_COMPANY_5521", "add-button", "repeat-snapshot", "\"value", "profile", "count");
    }

    private static InteractionDecisionService service(JevClient client) {
        return new InteractionDecisionService(Optional.of(new JevInteractionDecisionProvider(client)),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new InteractionObservationProjector());
    }
}
