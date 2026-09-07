package com.careerform.formanalysis.application.port;

import java.util.List;
import java.util.Map;

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
        List<String> expectedFieldNames, List<String> selectableProfileValues,
        Map<String, String> revealedFieldBindings
    ) implements Result {

        public SelectOptionAction(
            String candidateId, String profileFieldKey, String optionDisplayName, String targetSectionId
        ) {
            this(candidateId, profileFieldKey, optionDisplayName, targetSectionId, null, null, null);
        }

        public SelectOptionAction(
            String candidateId, String profileFieldKey, String optionDisplayName, String targetSectionId,
            List<String> expectedFieldNames
        ) {
            this(candidateId, profileFieldKey, optionDisplayName, targetSectionId, expectedFieldNames, null, null);
        }
    }

    record NoAction(String candidateId) implements Result {
    }
}
