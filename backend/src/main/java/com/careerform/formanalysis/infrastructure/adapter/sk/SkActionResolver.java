package com.careerform.formanalysis.infrastructure.adapter.sk;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

final class SkActionResolver implements ActionResolver {

    @Override
    public Resolution resolve(PreparationAnalysisRequest request) {
        return new Resolution(
            request.schemaVersion(),
            request.snapshotId(),
            request.actionCandidateIdsInTraversalOrder().stream()
                .map(NoAction::new)
                .map(Result.class::cast)
                .toList()
        );
    }
}
