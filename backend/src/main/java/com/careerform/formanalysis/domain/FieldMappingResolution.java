package com.careerform.formanalysis.domain;

import java.util.List;

public record FieldMappingResolution(
    int schemaVersion,
    String snapshotId,
    List<Result> results
) {

    public sealed interface Result permits Match, NoMatch {
        String candidateId();
    }

    public record Match(
        String candidateId,
        String profileFieldKey
    ) implements Result {
    }

    public record NoMatch(String candidateId) implements Result {
    }
}
