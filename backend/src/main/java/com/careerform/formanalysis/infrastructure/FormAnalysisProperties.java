package com.careerform.formanalysis.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@Validated
@ConfigurationProperties("career-form.form-analysis")
public record FormAnalysisProperties(
    @DefaultValue("65536")
    @Min(1024)
    @Max(65536)
    int maxRequestBytes
) {
}
