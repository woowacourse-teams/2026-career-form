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

    record AddAction(String candidateId, List<String> expectedFieldNames) implements Result {
        public AddAction(String candidateId) {
            this(candidateId, null);
        }
    }

    record SelectOptionAction(
        String candidateId, String profileFieldKey, String optionDisplayName, String targetSectionId,
        List<String> expectedFieldNames
    ) implements Result {

        public SelectOptionAction(
            String candidateId, String profileFieldKey, String optionDisplayName, String targetSectionId
        ) {
            this(candidateId, profileFieldKey, optionDisplayName, targetSectionId, null);
        }
    }

    record NoAction(String candidateId) implements Result {
    }
}
