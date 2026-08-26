package com.careerform.formanalysis.domain;

import java.util.ArrayList;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PreparationSnapshot(
    int schemaVersion,
    @NotBlank @Size(max = FormAnalysisConstraints.ID_MAX_LENGTH) String snapshotId,
    @NotNull @Valid Site site,
    @NotNull @Size(min = 1) List<@Valid Section> sections
) {

    public List<ActionCandidate> actionCandidatesInTraversalOrder() {
        List<ActionCandidate> candidates = new ArrayList<>();
        if (sections == null) {
            return List.of();
        }
        for (Section section : sections) {
            if (section == null) {
                continue;
            }
            addAll(candidates, section.actionCandidates());
            if (section.items() == null) {
                continue;
            }
            for (Item item : section.items()) {
                if (item != null) {
                    addAll(candidates, item.actionCandidates());
                }
            }
        }
        return List.copyOf(candidates);
    }

    public List<String> actionCandidateIdsInTraversalOrder() {
        return actionCandidatesInTraversalOrder().stream()
            .map(ActionCandidate::candidateId)
            .toList();
    }

    private static void addAll(
        List<ActionCandidate> destination,
        List<ActionCandidate> source
    ) {
        if (source != null) {
            destination.addAll(source);
        }
    }

    public record Section(
        @NotBlank @Size(max = FormAnalysisConstraints.ID_MAX_LENGTH) String sectionId,
        @Size(min = 1, max = FormAnalysisConstraints.ID_MAX_LENGTH)
        String parentSectionId,
        @Size(min = 1, max = FormAnalysisConstraints.METADATA_MAX_LENGTH)
        String displayName,
        @NotNull List<@Valid ActionCandidate> actionCandidates,
        @Size(min = 1)
        List<@Valid Item> items
    ) {
    }

    public record Item(
        @NotBlank @Size(max = FormAnalysisConstraints.ID_MAX_LENGTH) String itemId,
        @NotNull @Size(min = 1) List<@Valid ActionCandidate> actionCandidates
    ) {
    }

    public record ActionCandidate(
        @NotBlank @Size(max = FormAnalysisConstraints.ID_MAX_LENGTH) String candidateId,
        @NotNull FormElement element,
        @NotNull FormControl control,
        @NotNull Visibility visibility,
        @Size(min = 1, max = FormAnalysisConstraints.METADATA_MAX_LENGTH)
        String displayName,
        @Size(min = 1, max = FormAnalysisConstraints.METADATA_MAX_LENGTH)
        String domId,
        @Size(min = 1, max = FormAnalysisConstraints.METADATA_MAX_LENGTH)
        String domName,
        @AssertTrue Boolean disabled,
        @AssertTrue Boolean readonly,
        @AssertTrue Boolean inert
    ) {
    }
}
