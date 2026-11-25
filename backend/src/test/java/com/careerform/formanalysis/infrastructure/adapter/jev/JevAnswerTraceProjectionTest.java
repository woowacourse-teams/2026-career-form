package com.careerform.formanalysis.infrastructure.adapter.jev;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.generic.ChoiceFieldResolver;
import com.careerform.formanalysis.generic.ChoiceSectionClassifier;
import com.careerform.formanalysis.generic.SectionCategories;

class JevAnswerTraceProjectionTest {
    private static final String PRIVATE = "SYNTHETIC_PRIVATE_498";
    private static final SupportedProfileFields FIELDS = new SupportedProfileFields();
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    @Test
    void classificationKeepsStructuralEvidenceAndAliasesParentReferences() {
        var prompts = ChoiceSectionClassifier.promptParts(new SectionCategories(FIELDS));
        var sections = new LinkedHashMap<String, Object>();
        sections.put(PRIVATE, Map.of("title", "email", "labels", List.of("email", PRIVATE),
            "controlKinds", List.of("text", PRIVATE), "repeated", true));
        sections.put(PRIVATE + "_child", Map.of("parent", PRIVATE, "title", PRIVATE));
        var projection = new JevAnswerTraceProjection(Map.of("sections", sections),
            Map.of(PRIVATE, question(prompts, PRIVATE, "PERSONAL")));
        var state = MAPPER.valueToTree(projection.inputs()).path("state").path("sections");

        assertThat(projection.stage()).isEqualTo("section-classification");
        assertThat(state.path("section_0").path("repeated").asBoolean()).isTrue();
        assertThat(state.path("section_0").path("labels").get(0).asString()).isEqualTo("email");
        assertThat(state.path("section_0").path("controlKinds").get(0).asString()).isEqualTo("text");
        assertThat(state.path("section_1").path("parent").asString()).isEqualTo("section_0");
        assertThat(projection.inputs().toString()).doesNotContain(PRIVATE);
        assertThat(projection.answer(PRIVATE, new JevClient.Judgement("PERSONAL", 0.61,
            Map.of("PERSONAL", 0.61, "ABSTAIN", 0.39)))).containsEntry("questionId", "section_0")
            .containsEntry("providerChoice", "PERSONAL").containsEntry("confidence", 0.61);
    }

    @Test
    void genericFieldsKeepContextAndSupportedNameAndDateCriteria() {
        var prompts = ChoiceFieldResolver.promptParts(FIELDS);
        String date = "DATE_PART:education.university.startDate:YEAR";
        var criteria = Map.of(
            date, prompts.get("criterion." + date),
            "ENGLISH_FULL_NAME_GIVEN_FIRST", prompts.get("criterion.ENGLISH_FULL_NAME_GIVEN_FIRST.evidence"),
            "personal.personal.englishFamilyName", prompts.get("criterion.englishFamilyName.alone"),
            "ABSTAIN", prompts.get("criterion.ABSTAIN"));
        var observation = Map.of("label", "email", "labels", List.of("email", PRIVATE),
            "labelSources", List.of("aria-label", PRIVATE), "englishNameOrderEvidence", "GIVEN_FIRST",
            "control", "text", "rowIndex", 2, "options", List.of("email", PRIVATE));
        String guidance = prompts.get("confusionBoundaries") + "\n" + prompts.get("englishNameGuidance");
        var projection = new JevAnswerTraceProjection(Map.of(
            "section", Map.of("label", "email", "category", "PERSONAL", "parent", Map.of("label", PRIVATE)),
            "fields", Map.of(PRIVATE, observation), "confusionBoundaries", guidance),
            Map.of(PRIVATE, new JevClient.Choice(prompts.get("instructions").replace("{questionId}", PRIVATE), criteria)));
        var inputs = MAPPER.valueToTree(projection.inputs());
        var field = inputs.path("state").path("fields").path("candidate_0");

        assertThat(projection.stage()).isEqualTo("generic-fields");
        assertThat(field.path("labelSources").get(0).asString()).isEqualTo("aria-label");
        assertThat(field.path("englishNameOrderEvidence").asString()).isEqualTo("GIVEN_FIRST");
        assertThat(field.path("rowIndex").asInt()).isEqualTo(2);
        assertThat(inputs.path("state").path("confusionBoundaries").asString()).isEqualTo(guidance);
        assertThat(inputs.path("state").path("section").path("category").asString()).isEqualTo("PERSONAL");
        assertThat(projection.inputs().toString()).doesNotContain(PRIVATE, "UNRECOGNIZED_CRITERION");
        assertThat(projection.answer(PRIVATE, new JevClient.Judgement(date, 0.7, Map.of(date, 0.7, "ABSTAIN", 0.3))))
            .containsEntry("questionId", "candidate_0").containsEntry("providerChoice", date)
            .containsEntry("probabilities", Map.of(date, 0.7, "ABSTAIN", 0.3));
    }

    @Test
    void unknownInputInstructionsChoicesAndOutputIdentifiersNeverLeaveProjection() {
        var projection = new JevAnswerTraceProjection(Map.of("section", Map.of("label", PRIVATE, "category", PRIVATE),
            "fields", Map.of(PRIVATE, Map.of("candidateId", PRIVATE, "label", PRIVATE, "inputType", PRIVATE)),
            "confusionBoundaries", PRIVATE, "authorization", PRIVATE),
            Map.of(PRIVATE, new JevClient.Choice(PRIVATE, Map.of(PRIVATE, PRIVATE, "ABSTAIN", PRIVATE))));
        var answer = projection.answer(PRIVATE, new JevClient.Judgement(PRIVATE, 0.9, Map.of(PRIVATE, 0.9, "ABSTAIN", 0.1)));
        String wire = MAPPER.writeValueAsString(Map.of("inputs", projection.inputs(), "outputs", answer));

        assertThat(wire).doesNotContain(PRIVATE, "authorization", "confusionBoundaries", "clientSelection",
            "minConfidence", "resolverOutcome").contains("UNRECOGNIZED_INSTRUCTION", "UNRECOGNIZED_CRITERION");
    }

    @Test
    void oversizedInputKeepsItsGenericStageWithoutPrivateDetails() {
        for (boolean classification : List.of(true, false)) {
            Map<String, Object> state = classification
                ? Map.of("sections", Map.of(PRIVATE, Map.of("title", PRIVATE.repeat(2000))))
                : Map.of("section", Map.of(), "fields", Map.of(PRIVATE, Map.of("label", PRIVATE.repeat(2000))));
            var projection = new JevAnswerTraceProjection(state,
                Map.of(PRIVATE, new JevClient.Choice(PRIVATE, Map.of("ABSTAIN", PRIVATE))));

            assertThat(projection.stage()).isEqualTo(classification ? "section-classification" : "generic-fields");
            assertThat(projection.inputs()).containsExactlyEntriesOf(Map.of("projection", "INPUT_LIMIT"));
            assertThat(projection.answer(PRIVATE, new JevClient.Judgement(PRIVATE, 0.9, Map.of(PRIVATE, 0.9))))
                .containsExactlyEntriesOf(Map.of("projection", "UNSUPPORTED_OUTPUT"));
        }
    }

    private static JevClient.Choice question(Map<String, String> prompts, String id, String choice) {
        return new JevClient.Choice(prompts.get("instructions").replace("{questionId}", id),
            Map.of(choice, prompts.get("criterion." + choice), "ABSTAIN", prompts.get("criterion.ABSTAIN")));
    }
}
