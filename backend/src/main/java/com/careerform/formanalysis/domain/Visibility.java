package com.careerform.formanalysis.domain;

import com.fasterxml.jackson.annotation.JsonProperty;

public enum Visibility {
    @JsonProperty("visible")
    VISIBLE,
    @JsonProperty("hidden")
    HIDDEN
}
