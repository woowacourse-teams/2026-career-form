package com.careerform;

import static com.careerform.support.MongoTestProperties.MONGODB_HEALTH_DISABLED_PROPERTY;
import static com.careerform.support.MongoTestProperties.VALID_URI_ENVIRONMENT_PROPERTY;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.careerform.support.TestHttpClient;
import com.mongodb.ConnectionString;
import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.mongodb.autoconfigure.MongoConnectionDetails;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(
        useMainMethod = SpringBootTest.UseMainMethod.ALWAYS,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            VALID_URI_ENVIRONMENT_PROPERTY,
            MONGODB_HEALTH_DISABLED_PROPERTY
        })
@DisplayName("공통 애플리케이션 통합 테스트")
class CommonApplicationIntegrationTest {

    private final TestHttpClient testHttpClient = new TestHttpClient();

    @LocalServerPort
    private int port;

    @Autowired
    private MongoConnectionDetails mongoConnectionDetails;

    @Test
    @DisplayName("health 엔드포인트만 외부에 노출한다")
    void exposesOnlyHealthEndpoint() throws IOException, InterruptedException {
        HttpResponse<String> health = testHttpClient.get(port, "/actuator/health");
        HttpResponse<String> info = testHttpClient.get(port, "/actuator/info");

        assertEquals(200, health.statusCode());
        assertTrue(health.body().contains("\"status\":\"UP\""));
        assertEquals(404, info.statusCode());
    }

    @Test
    @DisplayName("주입한 MongoDB URI를 연결 정보에 반영한다")
    void usesInjectedMongoUri() {
        ConnectionString connectionString = mongoConnectionDetails.getConnectionString();

        assertEquals(List.of("mongo-test.invalid:27017"), connectionString.getHosts());
        assertEquals("career-form-test", connectionString.getDatabase());
    }
}
