package com.careerform.formanalysis.application.port;

import java.util.List;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;

public interface FieldMappingResolver {

    Resolution resolve(FieldsAnalysisRequest request);

    record Resolution(
        int schemaVersion,
        String snapshotId,
        List<Result> results
    ) {
    }

    sealed interface Result permits Match, NoMatch {
        String candidateId();
    }

    record Match(
        String candidateId,
        String profileFieldKey
    ) implements Result {
    }

    record NoMatch(String candidateId) implements Result {
    }
}
