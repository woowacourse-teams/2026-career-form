package com.careerform.support;

import static com.careerform.support.MongoTestProperties.MONGODB_HEALTH_DISABLED_PROPERTY;
import static com.careerform.support.MongoTestProperties.VALID_URI_ENVIRONMENT_PROPERTY;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mongodb.ConnectionString;
import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.mongodb.autoconfigure.MongoConnectionDetails;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.env.Environment;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            VALID_URI_ENVIRONMENT_PROPERTY,
            MONGODB_HEALTH_DISABLED_PROPERTY
        })
public abstract class AbstractProfileIntegrationTest {

    private final TestHttpClient testHttpClient = new TestHttpClient();

    @LocalServerPort
    private int port;

    @Autowired
    private Environment environment;

    @Autowired
    private MongoConnectionDetails mongoConnectionDetails;

    @Test
    void healthEndpointReturnsUp() throws IOException, InterruptedException {
        HttpResponse<String> response = get("/actuator/health");

        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"status\":\"UP\""));
    }

    @Test
    void onlyHealthEndpointIsConfiguredForWebExposure() {
        assertEquals(
                "health",
                environment.getProperty("management.endpoints.web.exposure.include"));
    }

    @Test
    void virtualThreadsAreEnabled() {
        assertEquals(
                Boolean.TRUE,
                environment.getProperty("spring.threads.virtual.enabled", Boolean.class));
    }

    @Test
    void mongoConnectionUsesInjectedUri() {
        ConnectionString connectionString = mongoConnectionDetails.getConnectionString();

        assertEquals(List.of("mongo-test.invalid:27017"), connectionString.getHosts());
        assertEquals("career-form-test", connectionString.getDatabase());
    }

    protected HttpResponse<String> get(String path) throws IOException, InterruptedException {
        return testHttpClient.get(port, path);
    }
}
