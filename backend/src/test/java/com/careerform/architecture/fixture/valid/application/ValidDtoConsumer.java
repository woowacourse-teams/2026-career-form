package com.careerform.architecture.fixture.valid.application;

import com.careerform.architecture.fixture.valid.application.dto.ValidApplicationDto;

public final class ValidDtoConsumer {

    public String read(ValidApplicationDto input) {
        return input.value();
    }
}
