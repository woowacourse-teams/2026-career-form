package com.careerform;

import static com.careerform.support.MongoTestProperties.UNAVAILABLE_URI_ENVIRONMENT_PROPERTY;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.careerform.support.TestHttpClient;
import java.io.IOException;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            UNAVAILABLE_URI_ENVIRONMENT_PROPERTY,
            "management.health.mongodb.enabled=true"
        })
class MongoUnavailableHealthIntegrationTest {

    private final TestHttpClient testHttpClient = new TestHttpClient();

    @LocalServerPort
    private int port;

    @Test
    void healthEndpointReturnsDownWhenMongoIsUnavailable()
            throws IOException, InterruptedException {
        HttpResponse<String> response = testHttpClient.get(port, "/actuator/health");

        assertEquals(503, response.statusCode());
        assertTrue(response.body().contains("\"status\":\"DOWN\""));
    }
}
