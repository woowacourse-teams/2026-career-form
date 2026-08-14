package com.careerform;

import static com.careerform.support.MongoTestProperties.MALFORMED_URI_COMMAND_LINE_PROPERTY;
import static com.careerform.support.MongoTestProperties.MONGODB_HEALTH_DISABLED_COMMAND_LINE_PROPERTY;
import static com.careerform.support.MongoTestProperties.UNAVAILABLE_URI_ENVIRONMENT_PROPERTY;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.careerform.support.TestHttpClient;
import java.io.IOException;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.test.context.NestedTestConfiguration;

@NestedTestConfiguration(NestedTestConfiguration.EnclosingConfiguration.OVERRIDE)
@DisplayName("MongoDB 실패 통합 테스트")
class MongoFailureIntegrationTest {

    @Test
    @DisplayName("MongoDB URI가 누락되면 애플리케이션 시작에 실패한다")
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

        assertConnectionStringFailure(exception);
    }

    @Test
    @DisplayName("MongoDB URI 형식이 잘못되면 애플리케이션 시작에 실패한다")
    void malformedMongoUriPreventsApplicationStart() {
        SpringApplication application = new SpringApplication(CareerFormApplication.class);

        RuntimeException exception = assertThrows(RuntimeException.class, () -> application.run(
                "--spring.main.web-application-type=none",
                MALFORMED_URI_COMMAND_LINE_PROPERTY,
                MONGODB_HEALTH_DISABLED_COMMAND_LINE_PROPERTY));

        assertConnectionStringFailure(exception);
    }

    private void assertConnectionStringFailure(RuntimeException exception) {
        Throwable rootCause = exception;
        while (rootCause.getCause() != null) {
            rootCause = rootCause.getCause();
        }

        IllegalArgumentException connectionStringFailure =
                assertInstanceOf(IllegalArgumentException.class, rootCause);
        assertTrue(connectionStringFailure.getMessage()
                .contains("Connection strings must start with either"));
    }

    @Nested
    @SpringBootTest(
            webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = {
                UNAVAILABLE_URI_ENVIRONMENT_PROPERTY,
                "management.health.mongodb.enabled=true"
            })
    @DisplayName("MongoDB 연결 장애")
    class UnavailableMongo {

        private final TestHttpClient testHttpClient = new TestHttpClient();

        @LocalServerPort
        private int port;

        @Test
        @DisplayName("MongoDB에 연결할 수 없으면 health가 DOWN을 반환한다")
        void healthEndpointReturnsDownWhenMongoIsUnavailable()
                throws IOException, InterruptedException {
            HttpResponse<String> response = testHttpClient.get(port, "/actuator/health");

            assertEquals(503, response.statusCode());
            assertTrue(response.body().contains("\"status\":\"DOWN\""));
        }
    }
}
