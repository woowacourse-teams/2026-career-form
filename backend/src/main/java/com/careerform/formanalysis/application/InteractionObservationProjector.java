package com.careerform.formanalysis.application;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

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
    private static final List<Term> STRUCTURE_TERMS = Stream.concat(Stream.of(
        term("삭제", "delete"),
        wordTerm("delete", "delete"),
        wordTerm("remove", "delete"),
        term("저장", "save"),
        wordTerm("save", "save"),
        term("초기화", "reset"),
        wordTerm("reset", "reset"),
        term("추가", "add"),
        wordTerm("add", "add"),
        term("학력", "education"),
        wordTerm("education", "education"),
        term("경력", "career"),
        wordTerm("career", "career"),
        term("자격", "certificate"),
        wordTerm("certificat", "certificate"),
        term("어학", "language"),
        wordTerm("language", "language"),
        term("프로젝트", "project"),
        wordTerm("project", "project"),
        term("논문", "publication"),
        wordTerm("publication", "publication")
    ), TERMS.stream()).toList();
    private static final List<Term> EDUCATION_LEVEL_TERMS = List.of(
        term("고등학교", "high school"),
        term("high school", "high school"),
        term("대학교", "university"),
        term("university", "university"),
        term("대학원", "graduate school"),
        term("graduate school", "graduate school"),
        term("전문학사", "associate"),
        term("associate", "associate"),
        term("학사", "bachelor"),
        term("bachelor", "bachelor"),
        term("석사", "master"),
        term("master", "master"),
        term("박사", "doctor"),
        term("doctor", "doctor"),
        term("phd", "doctor")
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
                candidates.add(project(candidateAlias, candidate,
                    decision.role().name().startsWith("SEARCH_RESULT_"),
                    decision.role().name().startsWith("CALENDAR_"),
                    decision.role() == InteractionDecisionRequest.Role.ROW_KIND_OPTION,
                    decision.role() == InteractionDecisionRequest.Role.REPEAT_ADD
                        || decision.role() == InteractionDecisionRequest.Role.SECTION_REVEAL));
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
        boolean calendarRole,
        boolean rowKindRole,
        boolean structureRole
    ) {
        List<InteractionDecisionProvider.SemanticLabel> labels = new ArrayList<>();
        if (!resultRole && !calendarRole && candidate.semanticContext() != null
            && candidate.semanticContext().labels() != null) {
            for (InteractionDecisionRequest.SemanticLabel label
                : candidate.semanticContext().labels()) {
                String sanitized = rowKindRole
                    ? sanitizeEducationLevel(label.text())
                    : sanitize(label.text(), structureRole);
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
            !resultRole && !calendarRole && candidate.semanticContext() != null
                && Boolean.TRUE.equals(candidate.semanticContext().required()),
            resultRole ? candidate.structure() : null,
            calendarRole ? candidate.calendarStructure() : null
        );
    }

    private static String sanitize(String raw, boolean structureRole) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String normalized = Normalizer.normalize(raw, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT)
            .replaceAll("\\s+", " ")
            .trim();
        Set<String> canonical = new LinkedHashSet<>();
        for (Term term : structureRole ? STRUCTURE_TERMS : TERMS) {
            if (term.wordPattern() == null ? normalized.contains(term.match())
                : term.wordPattern().matcher(normalized).find()) {
                canonical.add(term.canonical());
                if (canonical.size() == MAX_TERMS) {
                    break;
                }
            }
        }
        return canonical.isEmpty() ? null : String.join("; ", canonical);
    }

    private static String sanitizeEducationLevel(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String remaining = normalize(raw);
        Set<String> canonical = new LinkedHashSet<>();
        for (Term term : EDUCATION_LEVEL_TERMS) {
            if (remaining.contains(term.match())) {
                canonical.add(term.canonical());
                remaining = remaining.replace(term.match(), " ");
            }
        }
        return canonical.isEmpty() ? null : String.join("; ", canonical);
    }

    private static String normalize(String raw) {
        return Normalizer.normalize(raw, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT)
            .replaceAll("\\s+", " ")
            .trim();
    }

    private static Term term(String match, String canonical) {
        return new Term(match, canonical, null);
    }

    private static Term wordTerm(String match, String canonical) {
        return new Term(match, canonical, Pattern.compile("\\b" + match
            + (match.equals("certificat") ? "[a-z]*" : "") + "\\b", Pattern.UNICODE_CHARACTER_CLASS));
    }

    private record Term(String match, String canonical, Pattern wordPattern) {
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
