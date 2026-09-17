package com.careerform.architecture.fixture.valid.infrastructure;

import com.careerform.architecture.fixture.valid.application.port.ValidPort;

public final class ValidAdapter implements ValidPort {

    @Override
    public String resolve(String value) {
        return value;
    }
}
