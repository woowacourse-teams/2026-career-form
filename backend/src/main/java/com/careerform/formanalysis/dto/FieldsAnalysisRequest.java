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
        @NotNull @Size(min = 1) List<@NotNull @Valid FieldCandidate> fields,
        @Size(min = 1, max = 128) String itemGroupId
    ) {

        public Item(String itemId, List<FieldCandidate> fields) {
            this(itemId, fields, null);
        }
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
        @Size(min = 1) List<@NotNull @Valid Option> options,
        @Valid SemanticContext semanticContext
    ) {

        public FieldCandidate(
            String candidateId,
            FormElement element,
            FormControl control,
            Visibility visibility,
            String displayName,
            String domId,
            String domName,
            String placeholder,
            Boolean disabled,
            Boolean readonly,
            Boolean inert,
            List<Option> options
        ) {
            this(
                candidateId, element, control, visibility, displayName, domId,
                domName, placeholder, disabled, readonly, inert, options, null
            );
        }
    }

    public record SemanticContext(
        @Size(min = 1, max = 8) List<@NotNull @Valid SemanticLabel> labels,
        InputType inputType,
        InputMode inputMode,
        Autocomplete autocomplete,
        @AssertTrue Boolean required,
        @AssertTrue Boolean multiple,
        @Min(1) @Max(100_000) Integer maxLength,
        @Valid RepeatContext repeat
    ) {
    }

    public record SemanticLabel(
        @NotNull SemanticSource source,
        @NotBlank @Size(max = 120) String text
    ) {
    }

    public record RepeatContext(
        @NotBlank @Size(max = 128) String groupId,
        @NotNull @Min(0) @Max(127) Integer rowIndex,
        @NotNull @Min(1) @Max(128) Integer rowCount
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
        @JsonProperty("button")
        BUTTON,
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
        @JsonProperty("button")
        BUTTON,
        @JsonProperty("custom")
        CUSTOM
    }

    public enum Visibility {
        @JsonProperty("visible")
        VISIBLE,
        @JsonProperty("hidden")
        HIDDEN
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
        @JsonProperty("legend")
        LEGEND,
        @JsonProperty("section-heading")
        SECTION_HEADING,
        @JsonProperty("description")
        DESCRIPTION
    }

    public enum InputType {
        @JsonProperty("text")
        TEXT,
        @JsonProperty("email")
        EMAIL,
        @JsonProperty("tel")
        TEL,
        @JsonProperty("number")
        NUMBER,
        @JsonProperty("date")
        DATE,
        @JsonProperty("month")
        MONTH,
        @JsonProperty("url")
        URL,
        @JsonProperty("search")
        SEARCH
    }

    public enum InputMode {
        @JsonProperty("none")
        NONE,
        @JsonProperty("text")
        TEXT,
        @JsonProperty("decimal")
        DECIMAL,
        @JsonProperty("numeric")
        NUMERIC,
        @JsonProperty("tel")
        TEL,
        @JsonProperty("search")
        SEARCH,
        @JsonProperty("email")
        EMAIL,
        @JsonProperty("url")
        URL
    }

    public enum Autocomplete {
        @JsonProperty("name")
        NAME,
        @JsonProperty("given-name")
        GIVEN_NAME,
        @JsonProperty("family-name")
        FAMILY_NAME,
        @JsonProperty("additional-name")
        ADDITIONAL_NAME,
        @JsonProperty("email")
        EMAIL,
        @JsonProperty("tel")
        TEL,
        @JsonProperty("postal-code")
        POSTAL_CODE,
        @JsonProperty("street-address")
        STREET_ADDRESS,
        @JsonProperty("address-line1")
        ADDRESS_LINE1,
        @JsonProperty("address-line2")
        ADDRESS_LINE2,
        @JsonProperty("country")
        COUNTRY,
        @JsonProperty("country-name")
        COUNTRY_NAME,
        @JsonProperty("bday")
        BDAY,
        @JsonProperty("bday-day")
        BDAY_DAY,
        @JsonProperty("bday-month")
        BDAY_MONTH,
        @JsonProperty("bday-year")
        BDAY_YEAR,
        @JsonProperty("organization")
        ORGANIZATION,
        @JsonProperty("organization-title")
        ORGANIZATION_TITLE,
        @JsonProperty("off")
        OFF
    }
}
