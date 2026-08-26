package com.careerform.formanalysis.domain;

import com.fasterxml.jackson.annotation.JsonProperty;

public enum FormElement {
    @JsonProperty("button")
    BUTTON,
    @JsonProperty("input")
    INPUT,
    @JsonProperty("select")
    SELECT,
    @JsonProperty("textarea")
    TEXTAREA,
    @JsonProperty("custom")
    CUSTOM
}
