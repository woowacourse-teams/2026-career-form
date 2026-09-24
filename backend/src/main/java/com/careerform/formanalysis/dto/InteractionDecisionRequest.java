package com.careerform.formanalysis.dto;

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

public record InteractionDecisionRequest(
    @Min(2) @Max(2) int schemaVersion,
    @NotBlank @Size(max = 128) String snapshotId,
    @NotNull @Valid Site site,
    @NotNull @Size(min = 1, max = 8)
    List<@NotNull @Valid Decision> decisions
) {

    private static final String OPAQUE_ID = "^[A-Za-z][A-Za-z0-9_-]{0,63}$";
    private static final String CANONICAL_FIELD =
        "^[a-z][A-Za-z0-9]*\\.[a-z][A-Za-z0-9]*\\.[a-z][A-Za-z0-9]*$";

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

    public record Decision(
        @NotBlank @Pattern(regexp = OPAQUE_ID) String decisionId,
        @NotNull Role role,
        @NotBlank @Size(max = 128) @Pattern(regexp = CANONICAL_FIELD) String canonicalFieldKey,
        @NotNull @Size(min = 1, max = 24)
        List<@NotNull @Valid Candidate> candidates
    ) {
    }

    public record Candidate(
        @NotBlank @Pattern(regexp = OPAQUE_ID) String candidateId,
        @NotNull Element element,
        @NotNull Control control,
        @NotNull Visibility visibility,
        @AssertTrue Boolean disabled,
        @AssertTrue Boolean readonly,
        @AssertTrue Boolean inert,
        @NotNull RelationToTarget relationToTarget,
        @Valid SemanticContext semanticContext
    ) {
    }

    public record SemanticContext(
        @Size(min = 1, max = 8)
        List<@NotNull @Valid SemanticLabel> labels,
        @AssertTrue Boolean required
    ) {
    }

    public record SemanticLabel(
        @NotNull SemanticSource source,
        @NotBlank @Size(max = 120) String text
    ) {
    }

    public enum Role {
        SEARCH_POPUP_OPENER,
        SEARCH_QUERY_INPUT,
        SEARCH_SUBMIT
    }

    public enum Element {
        @JsonProperty("input")
        INPUT,
        @JsonProperty("button")
        BUTTON,
        @JsonProperty("link")
        LINK,
        @JsonProperty("custom")
        CUSTOM
    }

    public enum Control {
        @JsonProperty("text")
        TEXT,
        @JsonProperty("search")
        SEARCH,
        @JsonProperty("button")
        BUTTON,
        @JsonProperty("submit")
        SUBMIT
    }

    public enum Visibility {
        @JsonProperty("visible")
        VISIBLE,
        @JsonProperty("hidden")
        HIDDEN
    }

    public enum RelationToTarget {
        TARGET_CONTROL,
        SAME_FIELD_GROUP,
        SAME_REPEAT_ROW,
        SAME_CONTAINER,
        DIALOG_CONTROL
    }

    public enum SemanticSource {
        @JsonProperty("label")
        LABEL,
        @JsonProperty("aria-label")
        ARIA_LABEL,
        @JsonProperty("aria-labelledby")
        ARIA_LABELLEDBY,
        @JsonProperty("placeholder")
        PLACEHOLDER,
        @JsonProperty("title")
        TITLE,
        @JsonProperty("legend")
        LEGEND,
        @JsonProperty("section-heading")
        SECTION_HEADING,
        @JsonProperty("description")
        DESCRIPTION
    }
}
