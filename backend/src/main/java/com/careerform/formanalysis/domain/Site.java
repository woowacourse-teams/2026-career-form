package com.careerform.formanalysis.domain;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record Site(
    @NotBlank
    @Size(max = FormAnalysisConstraints.HOST_MAX_LENGTH)
    @Pattern(
        regexp = "^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\\.)*"
            + "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?::[0-9]{1,5})?$"
    )
    String host,
    @NotBlank
    @Size(max = FormAnalysisConstraints.PATH_PATTERN_MAX_LENGTH)
    @Pattern(regexp = "^/[^?#]*$")
    String pathPattern
) {
}
