package com.careerform.formanalysis.domain;

import com.fasterxml.jackson.annotation.JsonProperty;

public enum FormControl {
    @JsonProperty("button")
    BUTTON,
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
