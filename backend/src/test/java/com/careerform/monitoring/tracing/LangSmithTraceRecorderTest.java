package com.careerform.monitoring.tracing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class LangSmithTraceRecorderTest {

    @Test
    void sendsOneCompletedRunWithCorrelatedInputsOutputsAndOnlySuppliedUsage() throws Exception {
        try (Receiver receiver = new Receiver(200);
             var recorder = recorder(receiver, 4)) {
            String requestId = "728ad2e0-1e66-493d-8a79-3d1d825c2694";
            LangSmithTraceRecorder.Trace trace;
            try (var context = MDC.putCloseable("requestId", requestId)) {
                trace = recorder.begin("jev", "INTERACTION", "jev-latest",
                    Map.of("questions", Map.of("decision_0", Map.of("type", "choice"))));
            }
            recorder.complete(trace, Map.of("clientSelection", "ABSTAIN"),
                Map.of("input_tokens", 11L), null, 200);

            JsonNode run = receiver.body.get(5, TimeUnit.SECONDS);
            assertThat(run.path("name").asString()).isEqualTo("jev.INTERACTION");
            assertThat(run.path("session_name").asString()).isEqualTo("cf138-test");
            assertThat(run.path("inputs").path("questions").has("decision_0")).isTrue();
            assertThat(run.path("outputs").path("clientSelection").asString()).isEqualTo("ABSTAIN");
            assertThat(run.path("extra").path("metadata").path("request_id").asString()).isEqualTo(requestId);
            assertThat(run.path("extra").path("metadata").path("http_status").asInt()).isEqualTo(200);
            assertThat(run.path("outputs").path("usage_metadata").path("input_tokens").asInt())
                .isEqualTo(11);
            assertThat(run.path("outputs").path("usage_metadata").has("total_tokens")).isFalse();
            assertThat(run.path("id").asString()).isEqualTo(trace.id());
            assertThat(run.path("dotted_order").asString())
                .matches("[0-9]{8}T[0-9]{12}Z" + trace.id());
            assertThat(run.path("start_time").asString()).isNotBlank();
            assertThat(run.path("end_time").asString()).isNotBlank();
            assertThat(run.toString()).doesNotContain("synthetic-secret-key");
            assertThat(receiver.authorization.get(5, TimeUnit.SECONDS)).isEqualTo("synthetic-secret-key");
        }
    }

    @Test
    void recordsFiniteFailureWithoutInventingUsageOrTrustingClientRequestId() throws Exception {
        try (Receiver receiver = new Receiver(200);
             var recorder = recorder(receiver, 2);
             var context = MDC.putCloseable("requestId", "private-request-marker")) {
            var trace = recorder.begin("openai", "FIELD", "configured-model", Map.of());
            recorder.complete(trace, Map.of(), Map.of(), "TIMEOUT", null);
            JsonNode run = receiver.body.get(5, TimeUnit.SECONDS);
            assertThat(run.path("error").asString()).isEqualTo("TIMEOUT");
            assertThat(run.path("extra").path("metadata").has("request_id")).isFalse();
            assertThat(run.toString()).doesNotContain("private-request-marker", "usage_metadata");
        }
    }

    @Test
    void disabledOrMissingCredentialsNeverAdmitATrace() {
        try (var disabled = new LangSmithTraceRecorder(false, "key", "not-a-url", "project", 100, 2);
             var unconfigured = new LangSmithTraceRecorder(true, "", "not-a-url", "project", 100, 2)) {
            assertThat(disabled.begin("jev", "FIELD", "model", Map.of())).isNull();
            assertThat(unconfigured.begin("jev", "FIELD", "model", Map.of())).isNull();
            assertThatCode(() -> disabled.complete(null, Map.of(), Map.of(), null, null)).doesNotThrowAnyException();
        }
    }

    @Test
    void boundsAdmissionWhileReceiverStallsAndClosesWithoutWaitingForIt() throws Exception {
        try (Receiver receiver = new Receiver(200)) {
            receiver.release = new CountDownLatch(1);
            var recorder = recorder(receiver, 1);
            try {
                var trace = recorder.begin("jev", "FIELD", "model", Map.of());
                assertThat(trace).isNotNull();
                assertThat(recorder.begin("jev", "FIELD", "model", Map.of())).isNull();
                recorder.complete(trace, Map.of(), Map.of(), null, null);
                receiver.body.get(5, TimeUnit.SECONDS);
                assertThat(recorder.begin("jev", "FIELD", "model", Map.of())).isNull();
                long start = System.nanoTime();
                recorder.close();
                assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(3));
                assertThat(recorder.begin("jev", "FIELD", "model", Map.of())).isNull();
            } finally {
                receiver.release.countDown();
                recorder.close();
            }
        }
    }

    @Test
    void remoteRejectionDoesNotEscapeCompletionOrChangeTheApplicationResult() throws Exception {
        try (Receiver receiver = new Receiver(401);
             var recorder = recorder(receiver, 2)) {
            var trace = recorder.begin("openai", "INTERACTION", "model", Map.of());
            assertThatCode(() -> recorder.complete(trace, Map.of("selected", true), Map.of(), null, null))
                .doesNotThrowAnyException();
            assertThat(receiver.body.get(5, TimeUnit.SECONDS).path("outputs").path("selected").asBoolean()).isTrue();
        }
    }

    @Test
    void freezesMutableInputAtAdmission() throws Exception {
        try (Receiver receiver = new Receiver(200);
             var recorder = recorder(receiver, 2)) {
            var input = new java.util.LinkedHashMap<String, Object>();
            input.put("role", "FIELD");
            var trace = recorder.begin("jev", "FIELD", "model", input);
            input.put("role", "private-late-mutation");
            recorder.complete(trace, Map.of(), Map.of(), null, null);
            JsonNode run = receiver.body.get(5, TimeUnit.SECONDS);
            assertThat(run.path("inputs").path("role").asString()).isEqualTo("FIELD");
        }
    }

    @Test
    void outOfOrderCompletionsKeepTheirOwnPayloadAndDoNotSendTwice() throws Exception {
        try (Receiver receiver = new Receiver(200);
             var recorder = recorder(receiver, 4)) {
            var first = recorder.begin("jev", "FIELD", "jev-latest", Map.of("candidate", "candidate_0"));
            var second = recorder.begin("openai", "INTERACTION", "approved-model", Map.of("decision", "decision_1"));
            recorder.complete(second, Map.of("selected", "decision_1"), Map.of(), null, null);
            recorder.complete(second, Map.of("selected", "wrong-duplicate"), Map.of(), null, null);
            recorder.complete(first, Map.of("selected", "candidate_0"), Map.of(), null, null);
            JsonNode secondRun = receiver.requests.poll(5, TimeUnit.SECONDS);
            JsonNode firstRun = receiver.requests.poll(5, TimeUnit.SECONDS);
            assertThat(secondRun).isNotNull();
            assertThat(firstRun).isNotNull();
            assertThat(secondRun.path("id").asString()).isEqualTo(second.id());
            assertThat(secondRun.path("inputs").path("decision").asString()).isEqualTo("decision_1");
            assertThat(firstRun.path("id").asString()).isEqualTo(first.id());
            assertThat(firstRun.path("outputs").path("selected").asString()).isEqualTo("candidate_0");
            assertThat(first.id()).isNotEqualTo(second.id());
        }
    }

    @Test
    void oversizedInputAndOutputReleaseAdmissionWithoutSendingPrivateData() throws Exception {
        try (Receiver receiver = new Receiver(200);
             var recorder = recorder(receiver, 1)) {
            assertThat(recorder.begin("jev", "FIELD", "model", Map.of("label", "x".repeat(150_000)))).isNull();
            var trace = recorder.begin("jev", "FIELD", "model", Map.of());
            recorder.complete(trace, Map.of("value", "x".repeat(150_000)), Map.of(), null, null);
            var valid = recorder.begin("jev", "FIELD", "model", Map.of());
            assertThat(valid).isNotNull();
            recorder.complete(valid, Map.of("valid", true), Map.of(), null, null);
            assertThat(receiver.body.get(5, TimeUnit.SECONDS).path("id").asString()).isEqualTo(valid.id());
        }
    }

    private static LangSmithTraceRecorder recorder(Receiver receiver, int capacity) {
        return new LangSmithTraceRecorder(true, "synthetic-secret-key", receiver.url(), "cf138-test", 1000, capacity);
    }

    private static final class Receiver implements AutoCloseable {
        private final HttpServer server;
        private final CompletableFuture<JsonNode> body = new CompletableFuture<>();
        private final CompletableFuture<String> authorization = new CompletableFuture<>();
        private final java.util.concurrent.BlockingQueue<JsonNode> requests = new java.util.concurrent.LinkedBlockingQueue<>();
        private volatile CountDownLatch release = new CountDownLatch(0);

        private Receiver(int status) throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/runs", exchange -> {
                try {
                    authorization.complete(exchange.getRequestHeaders().getFirst("x-api-key"));
                    JsonNode request = JsonMapper.builder().build().readTree(exchange.getRequestBody().readAllBytes());
                    requests.add(request);
                    body.complete(request);
                    if (!release.await(5, TimeUnit.SECONDS)) {
                        throw new IOException("Receiver was not released");
                    }
                    byte[] response = "{}".getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(status, response.length);
                    exchange.getResponseBody().write(response);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                } finally {
                    exchange.close();
                }
            });
            server.start();
        }

        private String url() {
            return "http://127.0.0.1:" + server.getAddress().getPort();
        }

        @Override
        public void close() {
            release.countDown();
            server.stop(0);
        }
    }
}
