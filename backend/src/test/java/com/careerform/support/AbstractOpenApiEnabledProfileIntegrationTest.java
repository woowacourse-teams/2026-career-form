package com.careerform.support;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.careerformtest.openapi.OpenApiContractTestConfiguration;
import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Import(OpenApiContractTestConfiguration.class)
public abstract class AbstractOpenApiEnabledProfileIntegrationTest
        extends AbstractProfileIntegrationTest {

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void openApiDocumentIsAvailable() throws IOException, InterruptedException {
        HttpResponse<String> response = get("/v3/api-docs");

        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Content-Type").orElse("")
                .startsWith("application/json"));
        assertTrue(response.body().contains("\"openapi\""));
    }

    @Test
    void openApiDocumentMatchesPublishedContract() throws IOException, InterruptedException {
        HttpResponse<String> response = get("/v3/api-docs");
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
        assertEquals("date", requestSchema.at("/properties/requestedOn/format").asString());
        assertEquals(2, requestSchema.at("/properties/category/enum").size());

        JsonNode responseSchema = document.at("/components/schemas/OpenApiContractResponse");
        assertFalse(responseSchema.isMissingNode());
        assertEquals("uuid", responseSchema.at("/properties/id/format").stringValue());
    }

    @Test
    void swaggerUiIsAvailable() throws IOException, InterruptedException {
        HttpResponse<String> response = get("/swagger-ui/index.html");

        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Content-Type").orElse("")
                .startsWith("text/html"));
        assertTrue(response.body().contains("Swagger UI"));
    }
}
