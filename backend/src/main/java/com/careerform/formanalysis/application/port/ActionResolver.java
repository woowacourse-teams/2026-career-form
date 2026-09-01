package com.careerform.formanalysis.application.port;

import java.util.List;

import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

public interface ActionResolver {

    Resolution resolve(PreparationAnalysisRequest request);

    record Resolution(
        int schemaVersion,
        String snapshotId,
        List<Result> results
    ) {
    }

    sealed interface Result permits RevealAction, AddAction, SelectOptionAction, NoAction {
        String candidateId();
    }

    record RevealAction(
        String candidateId,
        String targetSectionId
    ) implements Result {
    }

    record AddAction(String candidateId) implements Result {
    }

    record SelectOptionAction(
        String candidateId, String profileFieldKey, String targetSectionId
    ) implements Result {
    }

    record NoAction(String candidateId) implements Result {
    }
}
