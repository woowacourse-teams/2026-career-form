package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.infrastructure.SelectedJev;

@Component
@Conditional(SelectedJev.class)
public final class JevFieldMappingResolver implements FieldMappingResolver {
    private final JevClient client;
    private final SupportedProfileFields fields;
    public JevFieldMappingResolver(JevClient client, SupportedProfileFields fields) {
        this.client = client;
        this.fields = fields;
    }
    @Override
    public Resolution resolve(FieldsAnalysisRequest request) {
        Map<String, Object> state = new LinkedHashMap<>();
        Map<String, FieldsAnalysisRequest.FieldCandidate> candidates = new LinkedHashMap<>();
        Map<String, Map<String, Object>> observations = new LinkedHashMap<>();
        Map<String, String> aliases = new LinkedHashMap<>();
        request.sections().forEach(section -> aliases.put(section.sectionId(), "section_" + aliases.size()));
        Map<String, Object> sectionObservations = new LinkedHashMap<>();
        for (var section : request.sections()) {
            String alias = aliases.get(section.sectionId());
            Map<String, Object> context = new LinkedHashMap<>();
            String label = com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer.sanitize(section.displayName());
            if (label != null) context.put("label", label);
            String parent = aliases.get(section.parentSectionId());
            if (parent != null) context.put("parentSectionId", parent);
            sectionObservations.put(alias, context);
            for (var field : section.fields()) add(candidates, observations, field, section.displayName(), alias, -1);
            if (section.items() != null) for (int row = 0; row < section.items().size(); row++)
                for (var field : section.items().get(row).fields())
                    add(candidates, observations, field, section.displayName(), alias, row);
        }
        state.put("fields", observations);
        state.put("sections", sectionObservations);
        state.put("canonicalMeanings", fields.promptCatalog());
        state.put("confusionBoundaries", fields.promptGuidance());
        Map<String, String> criteria = new LinkedHashMap<>();
        fields.keys().forEach(key -> criteria.put(key, "Direct canonical field: " + key));
        for (String recipe : List.of("KOREAN_FULL_NAME", "ENGLISH_FULL_NAME_GIVEN_FIRST", "ENGLISH_FULL_NAME_FAMILY_FIRST"))
            criteria.put(recipe, "Explicit combined full-name target using this exact order: " + recipe);
        criteria.put(JevClient.ABSTAIN, "No supported unambiguous mapping, or insufficient de-identified meaning.");
        Map<String, JevClient.Choice> questions = new LinkedHashMap<>();
        candidates.keySet().forEach(id -> questions.put(id, new JevClient.Choice(
            "Map only fields." + id + " using canonicalMeanings and confusionBoundaries. " +
            "Choose ABSTAIN for absent or ambiguous evidence. Do not split full names or invent values.", criteria)));
        Map<String, String> answers = client.choose(state, questions);
        List<Result> results = new ArrayList<>();
        candidates.forEach((id, candidate) -> {
            String choice = answers.get(id);
            if (JevClient.ABSTAIN.equals(choice) || JevObservations.conflicts(choice, observations.get(id)))
                results.add(new NoMatch(candidate.candidateId()));
            else if (fields.contains(choice))
                results.add(new Match(candidate.candidateId(), choice));
            else
                results.add(new Match(candidate.candidateId(), new DerivedBinding(DerivedRecipe.valueOf(choice))));
        });
        return new Resolution(request.schemaVersion(), request.snapshotId(), List.copyOf(results));
    }
    private static void add(Map<String, FieldsAnalysisRequest.FieldCandidate> candidates,
        Map<String, Map<String, Object>> observations, FieldsAnalysisRequest.FieldCandidate field,
        String section, String sectionId, int row) {
        String id = "field_" + candidates.size();
        candidates.put(id, field);
        Map<String, Object> observation = JevObservations.field(section, row, field);
        observation.put("sectionId", sectionId);
        observations.put(id, observation);
    }
}
