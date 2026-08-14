package com.careerform;

import static com.careerform.support.MongoTestProperties.MONGODB_HEALTH_DISABLED_COMMAND_LINE_PROPERTY;
import static com.careerform.support.MongoTestProperties.MONGODB_HEALTH_DISABLED_PROPERTY;
import static com.careerform.support.MongoTestProperties.VALID_URI_COMMAND_LINE_PROPERTY;
import static com.careerform.support.MongoTestProperties.VALID_URI_ENVIRONMENT_PROPERTY;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.StandardEnvironment;

@SpringBootTest(properties = {
    VALID_URI_ENVIRONMENT_PROPERTY,
    MONGODB_HEALTH_DISABLED_PROPERTY
})
class CareerFormApplicationTest {

    @Test
    void contextLoads() {
    }

    @Test
    void mainMethodStartsApplication() {
        try (ConfigurableApplicationContext context = SpringApplication
                .from(CareerFormApplication::main)
                .run(
                        "--spring.main.web-application-type=none",
                        VALID_URI_COMMAND_LINE_PROPERTY,
                        MONGODB_HEALTH_DISABLED_COMMAND_LINE_PROPERTY)
                .getApplicationContext()) {
            assertTrue(context.isActive());
        }
    }

    @Test
    void missingMongoUriPreventsApplicationStart() {
        SpringApplication application = new SpringApplication(CareerFormApplication.class);
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().remove(
                StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().remove(
                StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        application.setEnvironment(environment);

        RuntimeException exception = assertThrows(RuntimeException.class, () -> application.run(
                "--spring.main.web-application-type=none"));

        Throwable rootCause = exception;
        while (rootCause.getCause() != null) {
            rootCause = rootCause.getCause();
        }
        IllegalArgumentException connectionStringFailure =
                assertInstanceOf(IllegalArgumentException.class, rootCause);
        assertTrue(connectionStringFailure.getMessage()
                .contains("Connection strings must start with either"));
    }
}
