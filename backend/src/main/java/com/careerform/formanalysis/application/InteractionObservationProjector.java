package com.careerform.formanalysis.application;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;

@Component
final class InteractionObservationProjector {

    private static final int MAX_TERMS = 6;
    private static final List<Term> TERMS = List.of(
        term("학교명", "school name"),
        term("school name", "school name"),
        term("대학교", "university"),
        term("대학원", "graduate school"),
        term("고등학교", "high school"),
        term("university", "university"),
        term("graduate school", "graduate school"),
        term("high school", "high school"),
        term("검색", "search"),
        term("조회", "search"),
        term("search", "search"),
        term("lookup", "search"),
        term("find", "search"),
        term("입력", "input"),
        term("input", "input"),
        term("선택", "select"),
        term("select", "select"),
        term("확인", "confirm"),
        term("confirm", "confirm"),
        term("submit", "submit")
    );

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
                candidates.add(project(candidateAlias, candidate));
                candidateIds.put(candidateAlias, candidate.candidateId());
            }
            decisions.add(new InteractionDecisionProvider.Decision(
                decisionAlias,
                decision.role(),
                decision.canonicalFieldKey(),
                candidates
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
        InteractionDecisionRequest.Candidate candidate
    ) {
        List<InteractionDecisionProvider.SemanticLabel> labels = new ArrayList<>();
        if (candidate.semanticContext() != null
            && candidate.semanticContext().labels() != null) {
            for (InteractionDecisionRequest.SemanticLabel label
                : candidate.semanticContext().labels()) {
                String sanitized = sanitize(label.text());
                if (sanitized != null) {
                    labels.add(new InteractionDecisionProvider.SemanticLabel(
                        label.source().name().toLowerCase(Locale.ROOT)
                            .replace('_', '-'),
                        sanitized
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
            candidate.semanticContext() != null
                && Boolean.TRUE.equals(candidate.semanticContext().required())
        );
    }

    private static String sanitize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String normalized = Normalizer.normalize(raw, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT)
            .replaceAll("\\s+", " ")
            .trim();
        Set<String> canonical = new LinkedHashSet<>();
        for (Term term : TERMS) {
            if (normalized.contains(term.match())) {
                canonical.add(term.canonical());
                if (canonical.size() == MAX_TERMS) {
                    break;
                }
            }
        }
        return canonical.isEmpty() ? null : String.join("; ", canonical);
    }

    private static Term term(String match, String canonical) {
        return new Term(match, canonical);
    }

    private record Term(String match, String canonical) {
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
