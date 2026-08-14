package com.careerform;

import static com.careerform.support.MongoTestProperties.MONGODB_HEALTH_DISABLED_PROPERTY;
import static com.careerform.support.MongoTestProperties.VALID_URI_ENVIRONMENT_PROPERTY;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.careerform.support.TestHttpClient;
import java.io.IOException;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.NestedTestConfiguration;

@NestedTestConfiguration(NestedTestConfiguration.EnclosingConfiguration.OVERRIDE)
@DisplayName("운영 환경 문서 비노출 통합 테스트")
class StagingProdDocumentationTest {

    @Nested
    @SpringBootTest(
            webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = {
                VALID_URI_ENVIRONMENT_PROPERTY,
                MONGODB_HEALTH_DISABLED_PROPERTY,
                "spring.profiles.active="
            })
    @DisplayName("기본 프로필")
    class DefaultProfile {

        private final TestHttpClient testHttpClient = new TestHttpClient();

        @LocalServerPort
        private int port;

        @Test
        @DisplayName("OpenAPI 문서와 Swagger UI를 노출하지 않는다")
        void doesNotExposeDocumentation() throws IOException, InterruptedException {
            assertDocumentationIsNotExposed(testHttpClient, port);
        }
    }

    @Nested
    @SpringBootTest(
            webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = {
                VALID_URI_ENVIRONMENT_PROPERTY,
                MONGODB_HEALTH_DISABLED_PROPERTY
            })
    @ActiveProfiles("staging")
    @DisplayName("staging 프로필")
    class StagingProfile {

        private final TestHttpClient testHttpClient = new TestHttpClient();

        @LocalServerPort
        private int port;

        @Test
        @DisplayName("OpenAPI 문서와 Swagger UI를 노출하지 않는다")
        void doesNotExposeDocumentation() throws IOException, InterruptedException {
            assertDocumentationIsNotExposed(testHttpClient, port);
        }
    }

    @Nested
    @SpringBootTest(
            webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = {
                VALID_URI_ENVIRONMENT_PROPERTY,
                MONGODB_HEALTH_DISABLED_PROPERTY
            })
    @ActiveProfiles("prod")
    @DisplayName("prod 프로필")
    class ProdProfile {

        private final TestHttpClient testHttpClient = new TestHttpClient();

        @LocalServerPort
        private int port;

        @Test
        @DisplayName("OpenAPI 문서와 Swagger UI를 노출하지 않는다")
        void doesNotExposeDocumentation() throws IOException, InterruptedException {
            assertDocumentationIsNotExposed(testHttpClient, port);
        }
    }

    private void assertDocumentationIsNotExposed(TestHttpClient testHttpClient, int port)
            throws IOException, InterruptedException {
        HttpResponse<String> openApi = testHttpClient.get(port, "/v3/api-docs");
        HttpResponse<String> swaggerUi = testHttpClient.get(port, "/swagger-ui/index.html");

        assertAll(
                () -> assertEquals(404, openApi.statusCode()),
                () -> assertEquals(404, swaggerUi.statusCode()));
    }
}
