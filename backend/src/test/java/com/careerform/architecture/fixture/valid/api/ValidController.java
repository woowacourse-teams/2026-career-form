package com.careerform.architecture.fixture.valid.api;

import com.careerform.architecture.fixture.valid.application.ValidInput;
import com.careerform.architecture.fixture.valid.application.ValidService;

public final class ValidController {

    private final ValidService service;

    public ValidController(ValidService service) {
        this.service = service;
    }

    public ValidResponse handle(ValidRequest request) {
        return ValidResponse.from(service.handle(new ValidInput(request.value())));
    }
}
