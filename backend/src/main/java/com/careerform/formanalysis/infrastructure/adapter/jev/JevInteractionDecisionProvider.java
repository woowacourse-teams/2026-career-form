package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.infrastructure.InteractionProviderConditions;

@Component
@Conditional(InteractionProviderConditions.JevOnly.class)
public final class JevInteractionDecisionProvider implements InteractionDecisionProvider {
    static final String ABSTAIN_CRITERION = "Cannot identify one safe, supported, unambiguous role.";
    static final String CANDIDATE_CRITERION = "This observed candidate only; do not choose hidden, disabled, readonly, inert or unrelated controls.";
    static String instructions(String role, String id) {
        return "Select the candidate with role " + role + " from observation " + id +
                ". Choose only the observed visible enabled control structurally related to the target or calendar. " +
                "Calendar roles use only the finite calendarStructure ownership, activation and valueShape evidence. " +
                "SEARCH_RESULT_CONTAINER, SEARCH_RESULT_ITEM and SEARCH_RESULT_ACTION classify structural shapes " +
                "shared across the complete result set, not an answer row. Use only finite structure evidence; " +
                "a result action requires mechanical activation evidence. Never choose result data, values, code or execution steps.";
    }
    private final JevClient client;
    public JevInteractionDecisionProvider(JevClient client) { this.client = client; }
    @Override
    public Resolution decide(Batch batch) {
        Map<String, ChoiceContext> state = new LinkedHashMap<>();
        Map<String, JevClient.Choice> questions = new LinkedHashMap<>();
        for (Decision decision : batch.decisions()) {
            Map<String, String> criteria = new LinkedHashMap<>();
            criteria.put(JevClient.ABSTAIN, ABSTAIN_CRITERION);
            decision.candidates().forEach(candidate -> criteria.put(candidate.candidateId(),
                CANDIDATE_CRITERION));
            state.put(decision.decisionId(), new ChoiceContext(decision.role().name(), decision.canonicalFieldKey(), decision.candidates()));
            questions.put(decision.decisionId(), new JevClient.Choice(
                instructions(decision.role().name(), decision.decisionId()), criteria));
        }
        var answers = client.choose(state, questions);
        List<Result> results = new ArrayList<>();
        for (Decision decision : batch.decisions()) {
            String selected = answers.get(decision.decisionId());
            results.add(JevClient.ABSTAIN.equals(selected)
                ? new Abstained(decision.decisionId(), decision.role())
                : new Selected(decision.decisionId(), decision.role(), selected));
        }
        return new Resolution(batch.schemaVersion(), List.copyOf(results));
    }
    private record ChoiceContext(String role, String canonicalFieldKey, List<Candidate> candidates) {}
}
