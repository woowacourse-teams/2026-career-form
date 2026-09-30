package com.careerform.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false",
    "career-form.analysis.enabled=false",
    "management.server.port=0",
    "management.health.mongodb.enabled=false"
})
@ActiveProfiles("dev")
@ExtendWith(OutputCaptureExtension.class)
class MonitoringEndpointTest {

    @Autowired
    private Environment environment;

    @Autowired
    private ExternalCallMetrics externalCallMetrics;

    @Test
    void preservesApplicationHealthButDoesNotExposeApplicationMetrics() throws Exception {
        assertThat(get("local.server.port", "/actuator/health").statusCode()).isEqualTo(200);
        assertThat(get("local.server.port", "/actuator/prometheus").statusCode()).isEqualTo(404);
    }

    @Test
    void exposesHistogramAndEnvironmentOnlyOnManagementPort() throws Exception {
        get("local.server.port", "/not-registered/synthetic-private-marker?token=synthetic-token");
        get("local.server.port", "/actuator/health");
        var response = get("local.management.port", "/actuator/prometheus");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("http_server_requests_seconds_bucket");
        assertThat(response.body()).contains("env=\"dev\"");
        assertThat(response.body()).contains("jvm_memory_used_bytes");
        assertThat(response.body()).doesNotContain("synthetic-private-marker", "synthetic-token");
    }

    @Test
    void logsUnknownRoutesWithoutPrivatePathOrQueryAndGeneratesRequestId(CapturedOutput output) throws Exception {
        var response = get("local.server.port", "/unknown/synthetic-private-marker?token=synthetic-token");

        assertThat(response.headers().firstValue("X-Request-Id")).isPresent();
        assertThat(response.headers().firstValue("X-Request-Id").orElseThrow())
            .matches("[a-f0-9-]{36}");
        assertThat(output.getOut()).contains("API_RESULT", "route=UNKNOWN", "status=404");
        assertThat(output.getAll()).doesNotContain("synthetic-private-marker", "synthetic-token");
    }

    @Test
    void exposesExternalCallBucketsAndTimeoutCounterWithEnvironmentLabels() throws Exception {
        externalCallMetrics.record("openai", "analysis", Duration.ofSeconds(21).toNanos(), true, true);
        var response = get("local.management.port", "/actuator/prometheus");

        assertThat(response.body()).contains("career_form_external_call_seconds_bucket");
        assertThat(response.body()).contains("career_form_external_timeouts_total");
        assertThat(response.body()).contains("le=\"5.0\"", "le=\"20.0\"", "env=\"dev\"", "provider=\"openai\"");
    }

    @Test
    void existingSafeErrorLogIncludesTheRequestContext(CapturedOutput output) {
        var requestId = UUID.randomUUID().toString();
        MDC.put("requestId", requestId);
        try {
            LoggerFactory.getLogger(MonitoringEndpointTest.class).warn("synthetic-safe-error-type");
            assertThat(output.getAll()).contains("requestId=" + requestId);
        } finally {
            MDC.remove("requestId");
        }
    }

    private HttpResponse<String> get(String port, String path) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(
            "http://127.0.0.1:" + environment.getRequiredProperty(port) + path
        )).GET().build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }
}
