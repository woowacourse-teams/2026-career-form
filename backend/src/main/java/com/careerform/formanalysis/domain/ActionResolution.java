package com.careerform.formanalysis.domain;

import java.util.List;

public record ActionResolution(
    int schemaVersion,
    String snapshotId,
    List<Result> results
) {

    public sealed interface Result permits RevealAction, AddAction, NoAction {
        String candidateId();
    }

    public record RevealAction(
        String candidateId,
        String targetSectionId
    ) implements Result {
    }

    public record AddAction(String candidateId) implements Result {
    }

    public record NoAction(String candidateId) implements Result {
    }
}
