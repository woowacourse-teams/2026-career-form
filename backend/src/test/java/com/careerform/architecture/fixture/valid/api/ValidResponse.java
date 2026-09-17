package com.careerform.architecture.fixture.valid.api;

import com.careerform.architecture.fixture.valid.application.ValidResult;

public record ValidResponse(String value) {

    public static ValidResponse from(ValidResult result) {
        return new ValidResponse(result.value());
    }
}
