package com.careerform.support;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;

public abstract class AbstractOpenApiDisabledProfileIntegrationTest
        extends AbstractProfileIntegrationTest {

    @Test
    void openApiDocumentIsNotExposed() throws IOException, InterruptedException {
        HttpResponse<String> response = get("/v3/api-docs");

        assertEquals(404, response.statusCode());
    }

    @Test
    void swaggerUiIsNotExposed() throws IOException, InterruptedException {
        HttpResponse<String> response = get("/swagger-ui/index.html");

        assertEquals(404, response.statusCode());
    }
}
