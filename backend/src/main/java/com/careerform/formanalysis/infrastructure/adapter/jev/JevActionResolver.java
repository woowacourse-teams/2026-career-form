package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.infrastructure.SelectedJev;
import com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer;

@Component
@Conditional(SelectedJev.class)
public final class JevActionResolver implements ActionResolver {
    private final JevClient client;
    public JevActionResolver(JevClient client) { this.client = client; }
    @Override
    public Resolution resolve(PreparationAnalysisRequest request) {
        Map<String, PreparationAnalysisRequest.ActionCandidate> candidates = new LinkedHashMap<>();
        Map<String, Object> observations = new LinkedHashMap<>();
        Map<String, String> sections = new LinkedHashMap<>();
        Map<String, String> aliases = new LinkedHashMap<>();
        request.sections().forEach(section -> aliases.put(section.sectionId(), "section_" + aliases.size()));
        Map<String, Object> sectionObservations = new LinkedHashMap<>();
        Map<String, String> criteria = new LinkedHashMap<>();
        criteria.put(JevClient.ABSTAIN, "No safe preparation action; search/save/submit/reset/auth/file/selection are not preparation.");
        criteria.put("ADD", "Explicit add-one-repeatable-entry button with a clear repeat-group relationship.");
        for (var section : request.sections()) {
            String alias = aliases.get(section.sectionId());
            sections.put(alias, section.sectionId());
            String label = ProviderSemanticSanitizer.sanitize(section.displayName());
            Map<String, Object> context = new LinkedHashMap<>();
            if (label != null) {
                context.put("label", label);
                criteria.put("REVEAL_" + alias, "Reveal existing section " + alias + ": " + label);
            }
            String parent = aliases.get(section.parentSectionId());
            if (parent != null) context.put("parentSectionId", parent);
            sectionObservations.put(alias, context);
            for (var action : section.actionCandidates()) add(candidates, observations, action, section.displayName(), alias, -1);
            if (section.items() != null) for (int row = 0; row < section.items().size(); row++)
                for (var action : section.items().get(row).actionCandidates())
                    add(candidates, observations, action, section.displayName(), alias, row);
        }
        Map<String, JevClient.Choice> questions = new LinkedHashMap<>();
        candidates.forEach((id, action) -> {
            if (action.control() == PreparationAnalysisRequest.FormControl.BUTTON &&
                action.visibility() == PreparationAnalysisRequest.Visibility.VISIBLE &&
                !Boolean.TRUE.equals(action.disabled()) && !Boolean.TRUE.equals(action.readonly()) && !Boolean.TRUE.equals(action.inert()))
                questions.put(id, new JevClient.Choice(
                    "Classify only actions." + id + ". Use ABSTAIN when evidence or section relationship is ambiguous. Never execute anything.",
                    criteria));
        });
        var answers = client.choose(Map.of("actions", observations, "sections", sectionObservations), questions);
        List<Result> results = new ArrayList<>();
        candidates.forEach((id, action) -> {
            String choice = answers.getOrDefault(id, JevClient.ABSTAIN);
            if ("ADD".equals(choice)) results.add(new AddAction(action.candidateId()));
            else if (choice.startsWith("REVEAL_"))
                results.add(new RevealAction(action.candidateId(), sections.get(choice.substring("REVEAL_".length()))));
            else results.add(new NoAction(action.candidateId()));
        });
        return new Resolution(request.schemaVersion(), request.snapshotId(), List.copyOf(results));
    }
    private static void add(Map<String, PreparationAnalysisRequest.ActionCandidate> candidates,
        Map<String, Object> observations, PreparationAnalysisRequest.ActionCandidate action, String section, String sectionId, int row) {
        String id = "action_" + candidates.size();
        candidates.put(id, action);
        Map<String, Object> observation = JevObservations.action(section, row, action);
        observation.put("sectionId", sectionId);
        observations.put(id, observation);
    }
}
