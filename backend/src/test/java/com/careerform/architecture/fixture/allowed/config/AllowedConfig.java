package com.careerform.architecture.fixture.allowed.config;

import com.careerform.architecture.fixture.valid.application.ValidService;
import com.careerform.architecture.fixture.valid.infrastructure.ValidAdapter;

public final class AllowedConfig {

    public ValidService service() {
        return new ValidService(new ValidAdapter());
    }
}
