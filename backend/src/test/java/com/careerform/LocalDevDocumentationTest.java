package com.careerform;

import static com.careerform.support.MongoTestProperties.MONGODB_HEALTH_DISABLED_PROPERTY;
import static com.careerform.support.MongoTestProperties.VALID_URI_ENVIRONMENT_PROPERTY;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.careerform.support.TestHttpClient;
import com.careerformtest.openapi.OpenApiContractTestConfiguration;
import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.NestedTestConfiguration;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@NestedTestConfiguration(NestedTestConfiguration.EnclosingConfiguration.OVERRIDE)
@DisplayName("local과 dev 문서화 통합 테스트")
class LocalDevDocumentationTest {

    @Nested
    @SpringBootTest(
            webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = {
                VALID_URI_ENVIRONMENT_PROPERTY,
                MONGODB_HEALTH_DISABLED_PROPERTY
            })
    @ActiveProfiles("local")
    @Import(OpenApiContractTestConfiguration.class)
    @DisplayName("local 프로필")
    class LocalProfile {

        private final TestHttpClient testHttpClient = new TestHttpClient();

        @LocalServerPort
        private int port;

        @Autowired
        private ObjectMapper objectMapper;

        @Test
        @DisplayName("OpenAPI 문서를 공개 계약에 맞게 제공한다")
        void openApiDocumentMatchesPublishedContract()
                throws IOException, InterruptedException {
            HttpResponse<String> response = testHttpClient.get(port, "/v3/api-docs");

            assertEquals(200, response.statusCode());
            assertTrue(response.headers().firstValue("Content-Type").orElse("")
                    .startsWith("application/json"));
            assertTrue(response.body().contains("\"openapi\""));

            JsonNode document = objectMapper.readTree(response.body());
            assertEquals("3.0.1", document.path("openapi").asString());

            JsonNode operation = document.at("/paths/~1__test~1openapi-contract/post");
            assertFalse(operation.isMissingNode());
            JsonNode countParameter = operation.path("parameters").valueStream()
                    .filter(parameter -> "count".equals(parameter.path("name").stringValue()))
                    .findFirst()
                    .orElseThrow();
            assertEquals(
                    1,
                    countParameter.path("schema").path("minimum").intValue());
            assertEquals(
                    100,
                    countParameter.path("schema").path("maximum").intValue());

            JsonNode requestSchema = document.at("/components/schemas/OpenApiContractRequest");
            assertFalse(requestSchema.isMissingNode());
            assertEquals(
                    Set.of("category", "name", "requestedOn"),
                    requestSchema.path("required").valueStream()
                            .map(JsonNode::stringValue)
                            .collect(Collectors.toUnmodifiableSet()));
            assertEquals(1, requestSchema.at("/properties/name/minLength").intValue());
            assertEquals(
                    "date", requestSchema.at("/properties/requestedOn/format").asString());
            assertEquals(2, requestSchema.at("/properties/category/enum").size());

            JsonNode responseSchema = document.at("/components/schemas/OpenApiContractResponse");
            assertFalse(responseSchema.isMissingNode());
            assertEquals("uuid", responseSchema.at("/properties/id/format").stringValue());
        }

        @Test
        @DisplayName("Swagger UI를 제공한다")
        void swaggerUiIsAvailable() throws IOException, InterruptedException {
            HttpResponse<String> response = testHttpClient.get(port, "/swagger-ui/index.html");

            assertEquals(200, response.statusCode());
            assertTrue(response.headers().firstValue("Content-Type").orElse("")
                    .startsWith("text/html"));
            assertTrue(response.body().contains("Swagger UI"));
        }
    }

    @Nested
    @SpringBootTest(
            webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = {
                VALID_URI_ENVIRONMENT_PROPERTY,
                MONGODB_HEALTH_DISABLED_PROPERTY
            })
    @ActiveProfiles("dev")
    @DisplayName("dev 프로필")
    class DevProfile {

        private final TestHttpClient testHttpClient = new TestHttpClient();

        @LocalServerPort
        private int port;

        @Test
        @DisplayName("OpenAPI 문서를 제공한다")
        void openApiDocumentIsAvailable() throws IOException, InterruptedException {
            HttpResponse<String> response = testHttpClient.get(port, "/v3/api-docs");

            assertEquals(200, response.statusCode());
            assertTrue(response.headers().firstValue("Content-Type").orElse("")
                    .startsWith("application/json"));
            assertTrue(response.body().contains("\"openapi\""));
        }

        @Test
        @DisplayName("Swagger UI를 제공한다")
        void swaggerUiIsAvailable() throws IOException, InterruptedException {
            HttpResponse<String> response = testHttpClient.get(port, "/swagger-ui/index.html");

            assertEquals(200, response.statusCode());
            assertTrue(response.headers().firstValue("Content-Type").orElse("")
                    .startsWith("text/html"));
            assertTrue(response.body().contains("Swagger UI"));
        }
    }
}
