package com.careerform;

import com.careerform.support.AbstractOpenApiDisabledProfileIntegrationTest;
import org.springframework.test.context.ActiveProfiles;

@ActiveProfiles("staging")
class StagingProfileIntegrationTest extends AbstractOpenApiDisabledProfileIntegrationTest {
}
