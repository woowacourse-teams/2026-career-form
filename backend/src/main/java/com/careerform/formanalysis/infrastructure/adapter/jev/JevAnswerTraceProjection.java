package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.careerform.formanalysis.application.PromptSource;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.generic.ChoiceFieldResolver;
import com.careerform.formanalysis.generic.ChoiceSectionClassifier;
import com.careerform.formanalysis.generic.SectionCategories;
import com.careerform.formanalysis.infrastructure.adapter.ProviderTraceProjection;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** answer()의 두 범용 단계만 투영한다. choose()의 단계와 임계값 판단은 사용하지 않는다. */
final class JevAnswerTraceProjection {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final SupportedProfileFields FIELDS = new SupportedProfileFields();
    private static final SectionCategories CATEGORIES = new SectionCategories(FIELDS);
    private static final Map<String, String> FIELD_PROMPTS = ChoiceFieldResolver.promptParts(FIELDS);
    private static final Map<String, String> SECTION_PROMPTS = ChoiceSectionClassifier.promptParts(CATEGORIES);
    private final ProviderTraceProjection values = new ProviderTraceProjection();
    private final Map<String, Map<String, String>> choices = new LinkedHashMap<>();
    private final String stage;
    private final String idKey;
    private final Map<String, Object> inputs;

    JevAnswerTraceProjection(Object state, Map<String, JevClient.Choice> questions) {
        stage = state instanceof Map<?, ?> map && map.containsKey("fields") && map.containsKey("section")
            ? "generic-fields" : state instanceof Map<?, ?> map && map.containsKey("sections")
            ? "section-classification" : "analysis";
        idKey = stage.equals("section-classification") ? "sectionId" : "candidateId";
        String json = MAPPER.writeValueAsString(state);
        if (json.length() > ProviderTraceProjection.MAX_JSON_CHARS
            || MAPPER.writeValueAsString(questions).length() > ProviderTraceProjection.MAX_JSON_CHARS) {
            inputs = Map.of("projection", "INPUT_LIMIT");
            return;
        }
        JsonNode tree = MAPPER.readTree(json);
        if (stage.equals("analysis")) {
            inputs = Map.of("projection", "UNSUPPORTED_INPUT");
            return;
        }
        questions.keySet().forEach(id -> values.register(idKey, id));
        JsonNode entries = tree.path(stage.equals("generic-fields") ? "fields" : "sections");
        for (var entry : entries.properties()) {
            values.register(idKey, entry.getKey());
            values.collectIdentifiers(entry.getValue());
        }
        Map<String, Object> safeEntries = new LinkedHashMap<>();
        for (var entry : entries.properties()) {
            safeEntries.put(values.reference(idKey, entry.getKey()), stage.equals("generic-fields")
                ? field(entry.getValue()) : section(entry.getValue(), true));
        }
        Map<String, Object> safeState = new LinkedHashMap<>();
        safeState.put(stage.equals("generic-fields") ? "fields" : "sections", Map.copyOf(safeEntries));
        Map<String, String> prompts = stage.equals("generic-fields") ? FIELD_PROMPTS : SECTION_PROMPTS;
        if (stage.equals("generic-fields")) {
            safeState.put("section", section(tree.path("section"), false));
            String boundaries = tree.path("confusionBoundaries").asString("");
            String guidance = FIELD_PROMPTS.get("confusionBoundaries");
            if (boundaries.equals(guidance)
                || boundaries.equals(guidance + "\n" + FIELD_PROMPTS.get("englishNameGuidance"))) {
                safeState.put("confusionBoundaries", boundaries);
            }
        }
        Map<String, Object> safeQuestions = new LinkedHashMap<>();
        questions.forEach((id, question) -> {
            String alias = values.reference(idKey, id);
            String template = prompts.get("instructions");
            String instruction = template.replace(PromptSource.QUESTION_ID_PLACEHOLDER, id).equals(question.instructions())
                ? template.replace(PromptSource.QUESTION_ID_PLACEHOLDER, alias) : "UNRECOGNIZED_INSTRUCTION";
            Map<String, String> options = new LinkedHashMap<>();
            Map<String, String> criteria = new LinkedHashMap<>();
            question.criteria().forEach((option, criterion) -> {
                boolean known = criterion.equals(prompts.get("criterion." + option)) || alternate(option, criterion);
                String safeOption = known ? option : "UNKNOWN_REFERENCE";
                options.put(option, safeOption);
                criteria.put(safeOption, known ? criterion : "UNRECOGNIZED_CRITERION");
            });
            choices.put(id, Map.copyOf(options));
            safeQuestions.put(alias, Map.of("type", "choice", "instructions", instruction, "criteria", Map.copyOf(criteria)));
        });
        inputs = Map.of("state", Map.copyOf(safeState), "questions", Map.copyOf(safeQuestions));
    }

    private boolean alternate(String option, String criterion) {
        if (!stage.equals("generic-fields")) return false;
        String key = switch (option) {
            case "personal.personal.englishFamilyName" -> "criterion.englishFamilyName.alone";
            case "personal.personal.englishGivenName" -> "criterion.englishGivenName.alone";
            case "ENGLISH_FULL_NAME_GIVEN_FIRST", "ENGLISH_FULL_NAME_FAMILY_FIRST" -> "criterion." + option + ".evidence";
            default -> "";
        };
        return criterion.equals(FIELD_PROMPTS.get(key));
    }

    private Map<String, Object> field(JsonNode node) {
        Map<String, Object> result = new LinkedHashMap<>(values.object(node));
        if (node.path("labels").isArray()) result.put("labels", labels(node.path("labels")));
        if (node.path("labelSources").isArray()) {
            result.put("labelSources", node.path("labelSources").valueStream().limit(128)
                .map(source -> values.object(MAPPER.valueToTree(Map.of("source", source.asString("")))).get("source"))
                .toList());
        }
        String order = node.path("englishNameOrderEvidence").asString("");
        if (Set.of("GIVEN_FIRST", "FAMILY_FIRST", "CONFLICT").contains(order)) {
            result.put("englishNameOrderEvidence", order);
        }
        return Map.copyOf(result);
    }

    private Map<String, Object> section(JsonNode node, boolean classification) {
        Map<String, Object> result = new LinkedHashMap<>();
        String labelKey = classification ? "title" : "label";
        if (node.path(labelKey).isString()) result.put(labelKey, ProviderTraceProjection.semantic(node.get(labelKey).asString()));
        if (classification) {
            if (node.path("labels").isArray()) result.put("labels", labels(node.get("labels")));
            if (node.path("controlKinds").isArray()) {
                result.put("controlKinds", node.get("controlKinds").valueStream().limit(128)
                    .map(control -> values.object(MAPPER.valueToTree(Map.of("control", control.asString("")))).get("control"))
                    .toList());
            }
            if (node.path("repeated").isBoolean()) result.put("repeated", node.get("repeated").asBoolean());
            if (node.path("parent").isString()) result.put("parent", values.reference("sectionId", node.get("parent").asString()));
        } else {
            String category = node.path("category").asString("");
            if (CATEGORIES.contains(category)) result.put("category", category);
            if (node.path("parent").isObject()) result.put("parent", values.object(node.get("parent")));
        }
        return Map.copyOf(result);
    }

    private static List<String> labels(JsonNode node) {
        return node.valueStream().limit(128).map(value -> ProviderTraceProjection.semantic(value.asString(""))).toList();
    }

    String stage() { return stage; }
    Map<String, Object> inputs() { return inputs; }

    Map<String, Object> answer(String id, JevClient.Judgement judgement) {
        if (!choices.containsKey(id)) return Map.of("projection", "UNSUPPORTED_OUTPUT");
        Map<String, String> options = choices.get(id);
        Map<String, Double> probabilities = new LinkedHashMap<>();
        judgement.probabilities().forEach((key, probability) ->
            probabilities.put(options.getOrDefault(key, "UNKNOWN_REFERENCE"), probability));
        return Map.of("questionId", values.reference(idKey, id),
            "providerChoice", options.getOrDefault(judgement.choice(), "UNKNOWN_REFERENCE"),
            "confidence", judgement.confidence(), "probabilities", Map.copyOf(probabilities));
    }
}
