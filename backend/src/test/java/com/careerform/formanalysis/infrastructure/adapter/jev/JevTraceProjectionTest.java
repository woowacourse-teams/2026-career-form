package com.careerform.formanalysis.infrastructure.adapter.jev;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class JevTraceProjectionTest {
    private static final String SECRET = "SYNTHETIC_PRIVATE_8421";

    @Test
    void preservesStateAndQuestionsAndSeparatesConfidenceFromResolverConflict() {
        Map<String, Object> observation = Map.of("label", "address line 2", "element", "input", "control", "text",
            "visibility", "visible", "rowIndex", -1, "sectionId", SECRET);
        Map<String, Object> state = Map.of("fields", Map.of(SECRET, observation), "sections", Map.of(SECRET, Map.of("label", "email")));
        var criteria = new LinkedHashMap<String, String>();
        criteria.put("contact.contact.addressLine1", "Direct canonical field: contact.contact.addressLine1");
        criteria.put(JevClient.ABSTAIN, JevFieldMappingResolver.ABSTAIN_CRITERION);
        var questions = Map.of(SECRET, new JevClient.Choice(JevFieldMappingResolver.instructions(SECRET), criteria));
        var projection = JevTraceProjection.create(state, questions);
        var inputs = projection.inputs();
        var output = projection.answer(SECRET, "contact.contact.addressLine1", 0.9,
            Map.of("contact.contact.addressLine1", 0.9, "ABSTAIN", 0.1), "contact.contact.addressLine1", true, 0.8);
        String wire = JsonMapper.builder().build().writeValueAsString(Map.of("inputs", inputs, "answer", output));
        assertThat(wire).doesNotContain(SECRET).contains("address line 2", "instructions", "criteria", "NO_MATCH_CONFLICT",
            "providerChoice", "clientSelection", "contact.contact.addressLine1");
    }

    @Test
    void arbitraryInstructionsAndCriteriaAreNotCopied() {
        var state = Map.<String, Object>of("fields", Map.of("field_0", Map.of("label", "email")), "sections", Map.of());
        var projection = JevTraceProjection.create(state, Map.of("field_0", new JevClient.Choice(SECRET,
            Map.of("ABSTAIN", SECRET, SECRET, SECRET))));
        assertThat(projection.inputs().toString()).doesNotContain(SECRET).contains("UNRECOGNIZED_INSTRUCTION");
    }

    @Test
    void oversizedInputsProduceBoundedMetadataOnlyProjection() {
        var state = Map.of("fields", Map.of("field_0", Map.of("label", SECRET.repeat(10000))));
        var projection = JevTraceProjection.create(state, Map.of("field_0", new JevClient.Choice(SECRET, Map.of("ABSTAIN", SECRET))));
        assertThat(projection.inputs()).containsEntry("projection", "INPUT_LIMIT");
        assertThat(projection.inputs().toString().length()).isLessThan(100);
    }

    @Test
    void projectsInteractionReferencesAndFiniteStructuralEvidence() {
        String id = SECRET + "_decision";
        String candidate = SECRET + "_candidate";
        String role = "SEARCH_RESULT_ACTION";
        var state = Map.of(id, Map.of("role", role, "canonicalFieldKey", "education.university.schoolName",
            "candidates", java.util.List.of(Map.of("candidateId", candidate, "label", SECRET,
                "visibility", "visible", "relationToTarget", "DIALOG_CONTROL",
                "structure", Map.of("tag", "button", "activation", "native", "depth", 2)))));
        var questions = Map.of(id, new JevClient.Choice(JevInteractionDecisionProvider.instructions(role, id),
            Map.of("ABSTAIN", JevInteractionDecisionProvider.ABSTAIN_CRITERION,
                candidate, JevInteractionDecisionProvider.CANDIDATE_CRITERION)));
        var projection = JevTraceProjection.create(state, questions);
        var output = projection.answer(id, candidate, 0.9, Map.of(candidate, 0.9, "ABSTAIN", 0.1), candidate, false, 0.8);
        assertThat(output).containsEntry("questionId", "decision_0").containsEntry("providerChoice", "candidate_0")
            .containsEntry("clientSelection", "candidate_0").containsEntry("resolverOutcome", "SELECTED")
            .containsEntry("probabilities", Map.of("candidate_0", 0.9, "ABSTAIN", 0.1));
        var wire = JsonMapper.builder().build().readTree(JsonMapper.builder().build().writeValueAsString(projection.inputs()));
        var evidence = wire.get("state").get("decision_0").get("candidates").get(0);
        assertThat(evidence.get("candidateId").asString()).isEqualTo("candidate_0");
        assertThat(evidence.get("structure").get("activation").asString()).isEqualTo("native");
        assertThat(evidence.get("structure").get("depth").asInt()).isEqualTo(2);
        assertThat(projection.inputs().toString()).doesNotContain(SECRET);
    }

    @Test
    void actionSectionReferencesAreAliasedAndAbstentionIsNotDomSuccess() {
        var state = Map.of("actions", Map.of(SECRET, Map.of("label", "add", "sectionId", SECRET)),
            "sections", Map.of(SECRET, Map.of("label", "email")));
        String reveal = "REVEAL_" + SECRET;
        var questions = Map.of(SECRET, new JevClient.Choice(JevActionResolver.instructions(SECRET),
            Map.of("ABSTAIN", JevActionResolver.ABSTAIN_CRITERION, "ADD", JevActionResolver.ADD_CRITERION,
                reveal, "Reveal existing section " + SECRET + ": email")));
        var projection = JevTraceProjection.create(state, questions);
        var output = projection.answer(SECRET, reveal, 0.9, Map.of(reveal, 0.9, "ADD", 0.0, "ABSTAIN", 0.1), reveal, false, 0.8);
        assertThat(output).containsEntry("providerChoice", "REVEAL_section_0").containsEntry("resolverOutcome", "REVEAL_ACTION");
        var abstained = projection.answer(SECRET, "ADD", 0.7, Map.of("ADD", 0.9, reveal, 0.0, "ABSTAIN", 0.1), "ABSTAIN", false, 0.8);
        assertThat(abstained).containsEntry("providerChoice", "ADD").containsEntry("clientSelection", "ABSTAIN")
            .containsEntry("resolverOutcome", "NO_ACTION");
        assertThat(projection.inputs().toString() + output).doesNotContain(SECRET);
    }
}
