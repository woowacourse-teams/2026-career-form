package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.infrastructure.adapter.ProviderTraceProjection;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Closed vocabulary: arbitrary strings and provider identifiers are never copied. */
final class JevTraceProjection {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final Set<String> RECIPES = Set.of("KOREAN_FULL_NAME", "ENGLISH_FULL_NAME_GIVEN_FIRST", "ENGLISH_FULL_NAME_FAMILY_FIRST");
    private final ProviderTraceProjection values = new ProviderTraceProjection();
    private final Map<String, Map<String, String>> choices = new LinkedHashMap<>();
    private final Map<String, Map<String, Object>> observations = new LinkedHashMap<>();
    private final Map<String, Object> inputs;
    private final String stage;

    static JevTraceProjection create(Object state, Map<String, JevClient.Choice> questions) {
        return new JevTraceProjection(state, questions);
    }

    private JevTraceProjection(Object state, Map<String, JevClient.Choice> questions) {
        String json = MAPPER.writeValueAsString(state);
        if (json.length() > ProviderTraceProjection.MAX_JSON_CHARS || questions.size() > 128 ||
            MAPPER.writeValueAsString(questions).length() > ProviderTraceProjection.MAX_JSON_CHARS) {
            inputs = Map.of("projection", "INPUT_LIMIT");
            stage = "analysis";
            return;
        }
        JsonNode tree = MAPPER.readTree(json);
        stage = tree.has("fields") ? "fields" : tree.has("actions") ? "preparation" : "interaction";
        if (!tree.isObject()) {
            inputs = Map.of("projection", "UNSUPPORTED_INPUT");
            return;
        }
        String idKey = stage.equals("interaction") ? "decisionId" : "candidateId";
        questions.keySet().forEach(id -> values.register(idKey, id));
        values.collectIdentifiers(tree);
        for (String group : new String[]{"sections", "fields", "actions"}) {
            JsonNode entries = tree.get(group);
            if (entries != null && entries.isObject()) for (var entry : entries.properties()) {
                values.register(group.equals("sections") ? "sectionId" : "candidateId", entry.getKey());
                values.collectIdentifiers(entry.getValue());
            }
        }
        if (stage.equals("interaction")) for (var entry : tree.properties()) values.collectIdentifiers(entry.getValue());
        Map<String, Object> safeState = new LinkedHashMap<>();
        if (stage.equals("interaction")) {
            for (var entry : tree.properties()) safeState.put(values.reference("decisionId", entry.getKey()), values.object(entry.getValue()));
        } else {
            for (String group : new String[]{"sections", "fields", "actions"}) {
                JsonNode entries = tree.get(group);
                if (entries == null || !entries.isObject()) continue;
                Map<String, Object> safeEntries = new LinkedHashMap<>();
                for (var entry : entries.properties()) {
                    safeEntries.put(values.reference(group.equals("sections") ? "sectionId" : "candidateId", entry.getKey()), values.object(entry.getValue()));
                    if (group.equals("fields")) observations.put(entry.getKey(), values.object(entry.getValue()));
                }
                safeState.put(group, Map.copyOf(safeEntries));
            }
            var fields = new SupportedProfileFields();
            if (tree.has("canonicalMeanings") && fields.promptCatalog().equals(tree.get("canonicalMeanings").asString()))
                safeState.put("canonicalMeanings", fields.promptCatalog());
            if (tree.has("confusionBoundaries") && fields.promptGuidance().equals(tree.get("confusionBoundaries").asString()))
                safeState.put("confusionBoundaries", fields.promptGuidance());
        }
        Map<String, Object> safeQuestions = new LinkedHashMap<>();
        for (var entry : questions.entrySet()) {
            String id = entry.getKey();
            String alias = values.reference(idKey, id);
            JevClient.Choice question = entry.getValue();
            String instruction = "UNRECOGNIZED_INSTRUCTION";
            if (stage.equals("fields") && JevFieldMappingResolver.instructions(id).equals(question.instructions()))
                instruction = JevFieldMappingResolver.instructions(alias);
            else if (stage.equals("preparation") && JevActionResolver.instructions(id).equals(question.instructions()))
                instruction = JevActionResolver.instructions(alias);
            else if (stage.equals("interaction") && tree.has(id) && tree.get(id).has("role")) {
                String role = ProviderTraceProjection.role(tree.get(id).get("role").asString());
                if (!role.equals("UNRECOGNIZED_ROLE") && JevInteractionDecisionProvider.instructions(role, id).equals(question.instructions()))
                    instruction = JevInteractionDecisionProvider.instructions(role, alias);
            }
            Map<String, String> aliases = new LinkedHashMap<>();
            Map<String, String> criteria = new LinkedHashMap<>();
            for (var criterion : question.criteria().entrySet()) {
                String safe = option(criterion.getKey(), criterion.getValue(), tree);
                aliases.put(criterion.getKey(), safe);
                criteria.put(safe, criterion(safe, criterion.getValue()));
            }
            choices.put(id, Map.copyOf(aliases));
            safeQuestions.put(alias, Map.of("type", "choice", "instructions", instruction, "criteria", Map.copyOf(criteria)));
        }
        inputs = Map.of("state", Map.copyOf(safeState), "questions", Map.copyOf(safeQuestions));
    }

    private String option(String option, String criterion, JsonNode tree) {
        if (JevClient.ABSTAIN.equals(option)) return JevClient.ABSTAIN;
        if (stage.equals("fields")) {
            if (!ProviderTraceProjection.canonical(option).equals("UNKNOWN_REFERENCE") && criterion.equals("Direct canonical field: " + option)) return option;
            if (RECIPES.contains(option) && criterion.equals("Explicit combined full-name target using this exact order: " + option)) return option;
        }
        if (stage.equals("preparation")) {
            if (option.equals("ADD") && criterion.equals(JevActionResolver.ADD_CRITERION)) return "ADD";
            if (option.startsWith("REVEAL_") && tree.has("sections")) {
                String section = option.substring(7);
                JsonNode context = tree.get("sections").get(section);
                if (context != null && context.has("label")) {
                    String label = ProviderTraceProjection.semantic(context.get("label").asString());
                    if (!label.equals("UNRECOGNIZED_TEXT") && criterion.equals("Reveal existing section " + section + ": " + label))
                        return "REVEAL_" + values.reference("sectionId", section);
                }
            }
        }
        if (stage.equals("interaction") && criterion.equals(JevInteractionDecisionProvider.CANDIDATE_CRITERION))
            return values.reference("candidateId", option);
        return "UNKNOWN_REFERENCE";
    }

    private static String criterion(String option, String raw) {
        if (option.equals("ABSTAIN")) {
            if (raw.equals(JevFieldMappingResolver.ABSTAIN_CRITERION) || raw.equals(JevActionResolver.ABSTAIN_CRITERION) ||
                raw.equals(JevInteractionDecisionProvider.ABSTAIN_CRITERION)) return raw;
        } else if (!option.equals("UNKNOWN_REFERENCE")) {
            if (option.startsWith("REVEAL_")) return "Reveal existing section " + option.substring(7) + ": " +
                ProviderTraceProjection.semantic(raw.substring(raw.indexOf(": ") + 2));
            if (option.startsWith("candidate_")) return JevInteractionDecisionProvider.CANDIDATE_CRITERION;
            return raw;
        }
        return "UNRECOGNIZED_CRITERION";
    }

    Map<String, Object> inputs() { return inputs; }
    String stage() { return stage; }
    boolean conflicts(String id, String selection) {
        return stage.equals("fields") && !selection.equals(JevClient.ABSTAIN) && observations.containsKey(id)
            && JevObservations.conflicts(selection, observations.get(id));
    }

    Map<String, Object> answer(String id, String providerChoice, double confidence, Map<String, Double> probabilities,
                               String selection, boolean conflict, double threshold) {
        if (!choices.containsKey(id)) return Map.of("projection", "UNSUPPORTED_OUTPUT");
        Map<String, String> options = choices.get(id);
        Map<String, Double> safeProbabilities = new LinkedHashMap<>();
        probabilities.forEach((key, value) -> safeProbabilities.put(options.getOrDefault(key, "UNKNOWN_REFERENCE"), value));
        String safeSelection = options.getOrDefault(selection, "UNKNOWN_REFERENCE");
        String outcome = safeSelection.equals("UNKNOWN_REFERENCE") ? "UNKNOWN_OUTCOME" :
            selection.equals(JevClient.ABSTAIN) ? (stage.equals("fields") ? "NO_MATCH_ABSTAIN" : stage.equals("preparation") ? "NO_ACTION" : "ABSTAINED") :
            stage.equals("fields") ? (conflict ? "NO_MATCH_CONFLICT" : "MATCH") : stage.equals("preparation") ?
                (selection.equals("ADD") ? "ADD_ACTION" : "REVEAL_ACTION") : "SELECTED";
        return Map.of("questionId", values.reference(stage.equals("interaction") ? "decisionId" : "candidateId", id),
            "providerChoice", options.getOrDefault(providerChoice, "UNKNOWN_REFERENCE"), "confidence", confidence,
            "probabilities", Map.copyOf(safeProbabilities), "clientSelection", safeSelection,
            "minConfidence", threshold, "resolverOutcome", outcome);
    }
}
