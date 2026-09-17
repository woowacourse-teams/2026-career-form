package com.careerform.architecture.fixture.invalid.application;

import com.careerform.architecture.fixture.invalid.api.InvalidRequest;

public record InvalidApplicationInput(InvalidRequest.NestedValue value) {
}
