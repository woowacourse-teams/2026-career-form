package com.careerform.formanalysis.infrastructure.adapter.jev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Field;
import java.net.Authenticator;
import java.net.CookieHandler;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.function.Consumer;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.exception.ResolverException;

class JevClientTest {

    @Test
    void rejectsDuplicateAndMissingChoiceResponsesWithoutMakingNetworkCalls() throws Exception {
        for (String body : List.of(
            """
                {"model":"jev-test","answers":{"decision":{"type":"choice","choice":"candidate","confidence":0.9,
                "probabilities":{"ABSTAIN":0.1,"candidate":0.9},"choice":"candidate"}},
                "usage":{"input_tokens":1,"output_tokens":1}}
                """,
            """
                {"model":"jev-test","answers":{},"usage":{"input_tokens":1,"output_tokens":1}}
                """
        )) {
            JevClient client = clientWith(body);

            assertThatThrownBy(() -> client.choose("safe-state", questions()))
                .isInstanceOf(ResolverException.class)
                .hasMessage("Jev 분석 응답을 사용할 수 없습니다");
        }
    }

    @Test
    void abstainsWhenTheChoiceConfidenceIsBelowTheConfiguredMinimum() throws Exception {
        JevClient client = clientWith("""
            {"model":"jev-test","answers":{"decision":{"type":"choice","choice":"candidate","confidence":0.79,
            "probabilities":{"ABSTAIN":0.1,"candidate":0.9}}},
            "usage":{"input_tokens":1,"output_tokens":1}}
            """);

        assertThat(client.choose("safe-state", questions()))
            .containsExactly(Map.entry("decision", JevClient.ABSTAIN));
    }

    private static JevClient clientWith(String body) throws Exception {
        JevClient client = new JevClient("synthetic-key", "jev-test", 8000, 0.8, true);
        Field field = JevClient.class.getDeclaredField("http");
        field.setAccessible(true);
        field.set(client, new FixedResponseHttpClient(body));
        return client;
    }

    private static Map<String, JevClient.Choice> questions() {
        return Map.of("decision", new JevClient.Choice("choose safely", Map.of(
            JevClient.ABSTAIN, "abstain", "candidate", "candidate"
        )));
    }

    private static final class FixedResponseHttpClient extends HttpClient {
        private final String body;

        private FixedResponseHttpClient(String body) {
            this.body = body;
        }

        @Override public Optional<CookieHandler> cookieHandler() { return Optional.empty(); }
        @Override public Optional<Duration> connectTimeout() { return Optional.empty(); }
        @Override public Redirect followRedirects() { return Redirect.NEVER; }
        @Override public Optional<ProxySelector> proxy() { return Optional.empty(); }
        @Override public SSLContext sslContext() { throw new UnsupportedOperationException(); }
        @Override public SSLParameters sslParameters() { throw new UnsupportedOperationException(); }
        @Override public Optional<Authenticator> authenticator() { return Optional.empty(); }
        @Override public Version version() { return Version.HTTP_1_1; }
        @Override public Optional<Executor> executor() { return Optional.empty(); }
        @Override public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler) {
            throw new UnsupportedOperationException();
        }
        @Override public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request,
            HttpResponse.BodyHandler<T> handler) {
            return CompletableFuture.completedFuture(response(request, (T) body));
        }
        @Override public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request,
            HttpResponse.BodyHandler<T> handler,
            HttpResponse.PushPromiseHandler<T> pushPromiseHandler) {
            throw new UnsupportedOperationException();
        }
        @Override public WebSocket.Builder newWebSocketBuilder() {
            throw new UnsupportedOperationException();
        }

        private static <T> HttpResponse<T> response(HttpRequest request, T body) {
            return new HttpResponse<>() {
                @Override public int statusCode() { return 200; }
                @Override public HttpRequest request() { return request; }
                @Override public Optional<HttpResponse<T>> previousResponse() { return Optional.empty(); }
                @Override public HttpHeaders headers() { return HttpHeaders.of(Map.of(), (a, b) -> true); }
                @Override public T body() { return body; }
                @Override public Optional<javax.net.ssl.SSLSession> sslSession() { return Optional.empty(); }
                @Override public URI uri() { return request.uri(); }
                @Override public Version version() { return Version.HTTP_1_1; }
            };
        }
    }
}
