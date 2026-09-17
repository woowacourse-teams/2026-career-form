package com.careerform.architecture.fixture.valid.application;

import com.careerform.architecture.fixture.valid.application.port.ValidPort;

public final class ValidService {

    private final ValidPort port;

    public ValidService(ValidPort port) {
        this.port = port;
    }

    public ValidResult handle(ValidInput input) {
        return new ValidResult(port.resolve(input.value()));
    }
}
