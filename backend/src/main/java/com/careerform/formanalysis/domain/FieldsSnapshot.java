package com.careerform.formanalysis.domain;

import java.util.ArrayList;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record FieldsSnapshot(
    int schemaVersion,
    @NotBlank @Size(max = FormAnalysisConstraints.ID_MAX_LENGTH) String snapshotId,
    @NotNull @Valid Site site,
    @NotNull @Size(min = 1) List<@Valid Section> sections
) {

    public List<FieldCandidate> fieldCandidatesInTraversalOrder() {
        List<FieldCandidate> candidates = new ArrayList<>();
        if (sections == null) {
            return List.of();
        }
        for (Section section : sections) {
            if (section == null) {
                continue;
            }
            addAll(candidates, section.fields());
            if (section.items() == null) {
                continue;
            }
            for (Item item : section.items()) {
                if (item != null) {
                    addAll(candidates, item.fields());
                }
            }
        }
        return List.copyOf(candidates);
    }

    public List<String> fieldCandidateIdsInTraversalOrder() {
        return fieldCandidatesInTraversalOrder().stream()
            .map(FieldCandidate::candidateId)
            .toList();
    }

    private static void addAll(
        List<FieldCandidate> destination,
        List<FieldCandidate> source
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
        @NotNull List<@Valid FieldCandidate> fields,
        @Size(min = 1)
        List<@Valid Item> items
    ) {
    }

    public record Item(
        @NotBlank @Size(max = FormAnalysisConstraints.ID_MAX_LENGTH) String itemId,
        @NotNull @Size(min = 1) List<@Valid FieldCandidate> fields
    ) {
    }

    public record FieldCandidate(
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
        @Size(min = 1, max = FormAnalysisConstraints.METADATA_MAX_LENGTH)
        String placeholder,
        @AssertTrue Boolean disabled,
        @AssertTrue Boolean readonly,
        @AssertTrue Boolean inert,
        @Size(min = 1)
        List<@Valid Option> options
    ) {
    }

    public record Option(
        @NotBlank @Size(max = FormAnalysisConstraints.ID_MAX_LENGTH) String optionId,
        @NotBlank @Size(max = FormAnalysisConstraints.METADATA_MAX_LENGTH) String displayName
    ) {
    }
}
