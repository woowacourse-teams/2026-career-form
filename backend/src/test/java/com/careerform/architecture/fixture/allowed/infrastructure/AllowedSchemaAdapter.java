package com.careerform.architecture.fixture.allowed.infrastructure;

import com.careerform.architecture.fixture.valid.application.port.ValidPort;
import com.careerform.formanalysis.application.SupportedProfileFields;

public final class AllowedSchemaAdapter implements ValidPort {

    @Override
    public String resolve(String value) {
        return new SupportedProfileFields().keys().contains(value) ? value : "";
    }
}
