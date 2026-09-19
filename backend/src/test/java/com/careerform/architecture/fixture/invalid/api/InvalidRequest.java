package com.careerform.architecture.fixture.invalid.api;

public record InvalidRequest(NestedValue value) {

    public record NestedValue(String text) {
    }
}
