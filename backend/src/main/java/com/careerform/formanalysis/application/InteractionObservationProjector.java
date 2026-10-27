package com.careerform.formanalysis.application;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;

@Component
final class InteractionObservationProjector {

    Projection project(InteractionDecisionRequest request) {
        List<InteractionDecisionProvider.Decision> decisions = new ArrayList<>();
        Map<String, OriginalDecision> originals = new LinkedHashMap<>();
        for (int decisionIndex = 0;
            decisionIndex < request.decisions().size();
            decisionIndex++) {
            InteractionDecisionRequest.Decision decision = request.decisions()
                .get(decisionIndex);
            String decisionAlias = "d" + (decisionIndex + 1);
            List<InteractionDecisionProvider.Candidate> candidates =
                new ArrayList<>();
            Map<String, String> candidateIds = new LinkedHashMap<>();
            for (int candidateIndex = 0;
                candidateIndex < decision.candidates().size();
                candidateIndex++) {
                InteractionDecisionRequest.Candidate candidate = decision
                    .candidates()
                    .get(candidateIndex);
                String candidateAlias = "c" + (decisionIndex + 1)
                    + "_" + (candidateIndex + 1);
                candidates.add(project(candidateAlias, candidate,
                    decision.role().name().startsWith("SEARCH_RESULT_"),
                    decision.role().name().startsWith("CALENDAR_")));
                candidateIds.put(candidateAlias, candidate.candidateId());
            }
            decisions.add(new InteractionDecisionProvider.Decision(
                decisionAlias,
                decision.role(),
                decision.canonicalFieldKey(),
                candidates,
                decision.targetKind()
            ));
            originals.put(
                decisionAlias,
                new OriginalDecision(decision.decisionId(), candidateIds)
            );
        }
        return new Projection(
            new InteractionDecisionProvider.Batch(
                request.schemaVersion(),
                decisions
            ),
            originals
        );
    }

    private InteractionDecisionProvider.Candidate project(
        String candidateAlias,
        InteractionDecisionRequest.Candidate candidate,
        boolean resultRole,
        boolean calendarRole
    ) {
        List<InteractionDecisionProvider.SemanticLabel> labels = new ArrayList<>();
        if (!resultRole && !calendarRole && candidate.semanticContext() != null
            && candidate.semanticContext().labels() != null) {
            for (InteractionDecisionRequest.SemanticLabel label
                : candidate.semanticContext().labels()) {
                String masked = maskLabel(label.text());
                if (masked != null) {
                    labels.add(new InteractionDecisionProvider.SemanticLabel(
                        label.source().name().toLowerCase(Locale.ROOT)
                            .replace('_', '-'),
                        masked
                    ));
                }
            }
        }
        return new InteractionDecisionProvider.Candidate(
            candidateAlias,
            candidate.element(),
            candidate.control(),
            candidate.visibility(),
            Boolean.TRUE.equals(candidate.disabled()),
            Boolean.TRUE.equals(candidate.readonly()),
            Boolean.TRUE.equals(candidate.inert()),
            candidate.relationToTarget(),
            labels,
            !resultRole && !calendarRole && candidate.semanticContext() != null
                && Boolean.TRUE.equals(candidate.semanticContext().required()),
            resultRole ? candidate.structure() : null,
            calendarRole ? candidate.calendarStructure() : null
        );
    }

    private static String maskLabel(String raw) {
        return RawLabelMask.mask(raw);
    }

    record Projection(
        InteractionDecisionProvider.Batch batch,
        Map<String, OriginalDecision> originals
    ) {
        Projection {
            originals = Map.copyOf(originals);
        }

        InteractionDecisionProvider.Resolution restore(
            InteractionDecisionProvider.Resolution resolution
        ) {
            return new InteractionDecisionProvider.Resolution(
                resolution.schemaVersion(),
                resolution.results().stream()
                    .<InteractionDecisionProvider.Result>map(result -> {
                        OriginalDecision original = originals.get(
                            result.decisionId()
                        );
                        if (result
                            instanceof InteractionDecisionProvider.Selected selected) {
                            return new InteractionDecisionProvider.Selected(
                                original.decisionId(),
                                selected.role(),
                                original.candidateIds().get(
                                    selected.candidateId()
                                )
                            );
                        }
                        return new InteractionDecisionProvider.Abstained(
                            original.decisionId(),
                            result.role()
                        );
                    }).toList()
            );
        }
    }

    private record OriginalDecision(
        String decisionId,
        Map<String, String> candidateIds
    ) {
        OriginalDecision {
            candidateIds = Map.copyOf(candidateIds);
        }
    }
}
