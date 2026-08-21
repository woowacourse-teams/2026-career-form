package com.careerform.llm.mapping.domain;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record LlmMappingRequest(
    @NotNull @Size(max = 100) List<@Valid ContextField> contextFields,
    @NotNull @Size(min = 1, max = 100) List<@Valid TargetField> targetFields
) {

    public record ContextField(
        @NotBlank @Size(max = 128) String fieldId,
        @NotBlank @Size(max = 32) String element,
        @NotBlank @Size(max = 32) String control,
        @NotNull @Size(max = 120) String domId,
        @NotNull @Size(max = 120) String domName,
        @NotNull @Size(max = 120) String displayName,
        boolean required,
        @NotBlank @Size(max = 80) String profileFieldKey
    ) {
    }

    public record TargetField(
        @NotBlank @Size(max = 128) String fieldId,
        @NotBlank @Size(max = 32) String element,
        @NotBlank @Size(max = 32) String control,
        @NotNull @Size(max = 120) String domId,
        @NotNull @Size(max = 120) String domName,
        @NotNull @Size(max = 120) String displayName,
        boolean required
    ) {
    }
}
