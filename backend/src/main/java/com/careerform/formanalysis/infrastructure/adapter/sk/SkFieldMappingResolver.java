package com.careerform.formanalysis.infrastructure.adapter.sk;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;

final class SkFieldMappingResolver implements FieldMappingResolver {

    @Override
    public Resolution resolve(FieldsAnalysisRequest request) {
        return new Resolution(
            request.schemaVersion(),
            request.snapshotId(),
            request.fieldCandidateIdsInTraversalOrder().stream()
                .map(NoMatch::new)
                .map(Result.class::cast)
                .toList()
        );
    }
}
