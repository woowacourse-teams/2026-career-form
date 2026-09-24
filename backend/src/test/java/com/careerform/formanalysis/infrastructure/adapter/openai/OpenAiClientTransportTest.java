package com.careerform.formanalysis.infrastructure.adapter.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatAutoConfiguration;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.model.tool.autoconfigure.ToolCallingAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@org.junit.jupiter.api.DisplayName("OpenAI SDK loopback 전송")
class OpenAiClientTransportTest {

    private static final String RESPONSE = """
        {"id":"chatcmpl-synthetic","object":"chat.completion","created":1,
        "model":"gpt-4o-mini","choices":[{"index":0,"finish_reason":"stop",
        "message":{"role":"assistant","content":"{\\"schemaVersion\\":2,\\"snapshotId\\":\\"synthetic\\",\\"results\\":[]}"}}],
        "usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}}
        """;

    @Test
    @org.junit.jupiter.api.DisplayName("분석 요청은 SDK로 max_completion_tokens와 strict JSON schema를 loopback에 보낸다")
    void sendsConfiguredAnalysisOptionsThroughSdkTransport() throws Exception {
        try (LoopbackOpenAi stub = new LoopbackOpenAi(RESPONSE)) {
            client(stub.baseUrl()).generate(
                "synthetic system prompt", new Input("safe-input"), Output.class
            );

            JsonNode request = JsonMapper.builder().build().readTree(stub.request());
            assertThat(request.get("max_completion_tokens").asInt()).isEqualTo(2048);
            assertThat(request.get("store").asBoolean()).isTrue();
            assertThat(request.get("response_format").get("type").asString())
                .isEqualTo("json_schema");
            assertThat(request.get("response_format").get("json_schema").get("strict").asBoolean())
                .isTrue();
        }
    }

    private static OpenAiClient client(String baseUrl) {
        ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(
                OpenAiChatAutoConfiguration.class, ToolCallingAutoConfiguration.class
            ))
            .withPropertyValues(
                "spring.ai.openai.base-url=" + baseUrl,
                "spring.ai.openai.api-key=synthetic-test-key",
                "spring.ai.openai.chat.model=gpt-4o-mini",
                "spring.ai.openai.chat.max-completion-tokens=2048",
                "spring.ai.openai.chat.store=true",
                "spring.ai.openai.timeout=30s",
                "spring.ai.openai.max-retries=0"
            );
        AtomicReference<OpenAiClient> client = new AtomicReference<>();
        runner.run(context -> client.set(new OpenAiClient(
            ChatClient.builder(context.getBean(OpenAiChatModel.class)), JsonMapper.builder().build()
        )));
        return client.get();
    }

    private record Input(String value) {
    }

    private record Output(int schemaVersion, String snapshotId, List<Result> results) {
    }

    private record Result(String candidateId) {
    }

    private static final class LoopbackOpenAi implements AutoCloseable {
        private final AtomicReference<String> request = new AtomicReference<>();
        private final HttpServer server;

        private LoopbackOpenAi(String response) throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/v1/chat/completions", exchange -> respond(exchange, response));
            server.start();
        }

        private String baseUrl() {
            return "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
        }

        private String request() {
            return request.get();
        }

        private void respond(HttpExchange exchange, String response) throws IOException {
            request.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        }

        @Override
        public void close() {
            server.stop(0);
        }
    }
}
