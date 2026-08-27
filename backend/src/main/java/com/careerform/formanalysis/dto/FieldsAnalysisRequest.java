package com.careerform.formanalysis.dto;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record FieldsAnalysisRequest(
    @Min(2) @Max(2) int schemaVersion,
    @NotBlank @Size(max = 128) String snapshotId,
    @NotNull @Valid Site site,
    @NotNull @Size(min = 1) List<@NotNull @Valid Section> sections
) {

    public List<FieldCandidate> fieldCandidatesInTraversalOrder() {
        if (sections == null) {
            return List.of();
        }
        List<FieldCandidate> candidates = new ArrayList<>();
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

    public record Site(
        @NotBlank
        @Size(max = 253)
        @Pattern(
            regexp = "^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\\.)*"
                + "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?::[0-9]{1,5})?$"
        )
        String host,
        @NotBlank
        @Size(max = 512)
        @Pattern(regexp = "^/[^?#]*$")
        String pathPattern
    ) {
    }

    public record Section(
        @NotBlank @Size(max = 128) String sectionId,
        @Size(min = 1, max = 128) String parentSectionId,
        @Size(min = 1, max = 120) String displayName,
        @NotNull List<@NotNull @Valid FieldCandidate> fields,
        @Size(min = 1) List<@NotNull @Valid Item> items
    ) {
    }

    public record Item(
        @NotBlank @Size(max = 128) String itemId,
        @NotNull @Size(min = 1) List<@NotNull @Valid FieldCandidate> fields
    ) {
    }

    public record FieldCandidate(
        @NotBlank @Size(max = 128) String candidateId,
        @NotNull FormElement element,
        @NotNull FormControl control,
        @NotNull Visibility visibility,
        @Size(min = 1, max = 120) String displayName,
        @Size(min = 1, max = 120) String domId,
        @Size(min = 1, max = 120) String domName,
        @Size(min = 1, max = 120) String placeholder,
        @AssertTrue Boolean disabled,
        @AssertTrue Boolean readonly,
        @AssertTrue Boolean inert,
        @Size(min = 1) List<@NotNull @Valid Option> options
    ) {
    }

    public record Option(
        @NotBlank @Size(max = 128) String optionId,
        @NotBlank @Size(max = 120) String displayName
    ) {
    }

    public enum FormElement {
        @JsonProperty("input")
        INPUT,
        @JsonProperty("select")
        SELECT,
        @JsonProperty("textarea")
        TEXTAREA,
        @JsonProperty("custom")
        CUSTOM
    }

    public enum FormControl {
        @JsonProperty("text")
        TEXT,
        @JsonProperty("select")
        SELECT,
        @JsonProperty("radio")
        RADIO,
        @JsonProperty("checkbox")
        CHECKBOX,
        @JsonProperty("textarea")
        TEXTAREA,
        @JsonProperty("custom")
        CUSTOM
    }

    public enum Visibility {
        @JsonProperty("visible")
        VISIBLE,
        @JsonProperty("hidden")
        HIDDEN
    }
}
