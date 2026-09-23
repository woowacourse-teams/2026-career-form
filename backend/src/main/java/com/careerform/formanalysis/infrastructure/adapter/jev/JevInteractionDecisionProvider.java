package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.infrastructure.SelectedJev;

@Component
@Conditional(SelectedJev.class)
public final class JevInteractionDecisionProvider implements InteractionDecisionProvider {
    private final JevClient client;
    public JevInteractionDecisionProvider(JevClient client) { this.client = client; }
    @Override
    public Resolution decide(Batch batch) {
        Map<String, ChoiceContext> state = new LinkedHashMap<>();
        Map<String, JevClient.Choice> questions = new LinkedHashMap<>();
        for (Decision decision : batch.decisions()) {
            Map<String, String> criteria = new LinkedHashMap<>();
            criteria.put(JevClient.ABSTAIN, "Cannot identify one safe, supported, unambiguous role.");
            decision.candidates().forEach(candidate -> criteria.put(candidate.candidateId(),
                "This observed candidate only; do not choose hidden, disabled, readonly, inert or unrelated controls."));
            state.put(decision.decisionId(), new ChoiceContext(decision.role().name(), decision.canonicalFieldKey(), decision.candidates()));
            questions.put(decision.decisionId(), new JevClient.Choice(
                "Select the candidate with role " + decision.role().name() + " from observation " + decision.decisionId() +
                ". Only meaning classification: never choose search results, values, code or execution steps.", criteria));
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
