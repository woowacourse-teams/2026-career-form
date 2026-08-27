package com.careerform.formanalysis.infrastructure.adapter.sk;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;

final class SkFieldMappingResolver implements FieldMappingResolver {

    private final SkRuleCatalog catalog = new SkRuleCatalog();

    @Override
    public Resolution resolve(FieldsAnalysisRequest request) {
        return new Resolution(
            request.schemaVersion(),
            request.snapshotId(),
            request.fieldCandidatesInTraversalOrder().stream()
                .map(this::resolve)
                .toList()
        );
    }

    private Result resolve(FieldCandidate candidate) {
        return catalog.fieldRule(candidate.domName())
            .filter(rule -> rule.matches(candidate))
            .<Result>map(rule -> new Match(
                candidate.candidateId(),
                rule.profileFieldKey()
            ))
            .orElseGet(() -> new NoMatch(candidate.candidateId()));
    }
}
