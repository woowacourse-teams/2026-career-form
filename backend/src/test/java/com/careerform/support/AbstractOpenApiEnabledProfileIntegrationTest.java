package com.careerform.support;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;

public abstract class AbstractOpenApiEnabledProfileIntegrationTest
        extends AbstractProfileIntegrationTest {

    @Test
    void openApiDocumentIsAvailable() throws IOException, InterruptedException {
        HttpResponse<String> response = get("/v3/api-docs");

        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Content-Type").orElse("")
                .startsWith("application/json"));
        assertTrue(response.body().contains("\"openapi\""));
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
