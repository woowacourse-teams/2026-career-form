package com.careerform.architecture.fixture.invalid.api;

import com.careerform.architecture.fixture.invalid.infrastructure.InvalidAdapter;

public final class InvalidController {

    private final InvalidAdapter adapter;

    public InvalidController(InvalidAdapter adapter) {
        this.adapter = adapter;
    }
}
