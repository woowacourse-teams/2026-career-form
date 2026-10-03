package com.careerform.formanalysis.infrastructure.adapter.jev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

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
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.json.JsonMapper;
import com.careerform.monitoring.tracing.LangSmithTraceRecorder;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
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
    private static final String SECRET = "SYNTHETIC_PRIVATE_8421";
    private static final String FIELD = "contact.contact.addressLine1";

    @Test
    void recordsRawProviderAnswerAndThresholdedClientSelection() throws Exception {
        for (double confidence : List.of(0.79, 0.9)) {
            var recorder = recorder();
            var client = tracedClient(response(SECRET, confidence, Map.of(FIELD, 0.9, "ABSTAIN", 0.1)), recorder, true);
            var state = Map.of("fields", Map.of(SECRET, Map.of("label", "address line 1", "sectionId", SECRET)),
                "sections", Map.of(SECRET, Map.of("label", "email")));
            var questions = Map.of(SECRET, new JevClient.Choice(JevFieldMappingResolver.instructions(SECRET),
                Map.of(FIELD, "Direct canonical field: " + FIELD, "ABSTAIN", JevFieldMappingResolver.ABSTAIN_CRITERION)));
            String selection = confidence < 0.8 ? "ABSTAIN" : FIELD;
            assertThat(client.choose(state, questions)).containsEntry(SECRET, selection);
            ArgumentCaptor<Map<String, Object>> inputs = ArgumentCaptor.captor();
            verify(recorder).begin(eq("jev"), eq("fields"), eq("jev-test"), inputs.capture());
            ArgumentCaptor<Map<String, Object>> outputs = ArgumentCaptor.captor();
            ArgumentCaptor<Map<String, Number>> usage = ArgumentCaptor.captor();
            verify(recorder).complete(any(), outputs.capture(), usage.capture(), isNull(), eq(200));
            var answer = firstAnswer(outputs.getValue());
            assertThat(answer).containsEntry("providerChoice", FIELD).containsEntry("confidence", confidence)
                .containsEntry("probabilities", Map.of(FIELD, 0.9, "ABSTAIN", 0.1))
                .containsEntry("clientSelection", selection).containsEntry("minConfidence", 0.8)
                .containsEntry("resolverOutcome", confidence < 0.8 ? "NO_MATCH_ABSTAIN" : "MATCH");
            assertThat(usage.getValue()).containsExactlyInAnyOrderEntriesOf(Map.of("input_tokens", 7L, "output_tokens", 3L));
            assertThat(JsonMapper.builder().build().writeValueAsString(Map.of("inputs", inputs.getValue(), "outputs", outputs.getValue())))
                .doesNotContain(SECRET).doesNotContain("DOM_SUCCESS");
        }
    }

    @Test
    void recordsConflictThatTheRealResolverTurnsIntoNoMatch() throws Exception {
        var fields = new SupportedProfileFields();
        Map<String, Double> probabilities = new LinkedHashMap<>();
        fields.keys().forEach(key -> probabilities.put(key, 0.0));
        for (String recipe : List.of("KOREAN_FULL_NAME", "ENGLISH_FULL_NAME_GIVEN_FIRST", "ENGLISH_FULL_NAME_FAMILY_FIRST"))
            probabilities.put(recipe, 0.0);
        probabilities.put(FIELD, 0.9);
        probabilities.put("ABSTAIN", 0.1);
        var recorder = recorder();
        var client = tracedClient(response("field_0", 0.9, probabilities), recorder, true);
        var candidate = new FieldsAnalysisRequest.FieldCandidate(SECRET, FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT, FieldsAnalysisRequest.Visibility.VISIBLE, "address line 2",
            SECRET, SECRET, null, false, false, false, null);
        var request = new FieldsAnalysisRequest(2, SECRET, new FieldsAnalysisRequest.Site("example.test", "/"),
            List.of(new FieldsAnalysisRequest.Section(SECRET, null, "address", List.of(candidate), null)));
        var resolution = new JevFieldMappingResolver(client, fields).resolve(request);
        assertThat(resolution.results()).containsExactly(new FieldMappingResolver.NoMatch(SECRET));
        ArgumentCaptor<Map<String, Object>> outputs = ArgumentCaptor.captor();
        verify(recorder).complete(any(), outputs.capture(), any(), isNull(), eq(200));
        assertThat(firstAnswer(outputs.getValue())).containsEntry("providerChoice", FIELD)
            .containsEntry("clientSelection", FIELD).containsEntry("resolverOutcome", "NO_MATCH_CONFLICT");
        assertThat(outputs.getValue().toString()).doesNotContain(SECRET);
    }

    @Test
    void tiesAbstainAndProviderFailuresHaveOnlyFiniteDiagnostics() throws Exception {
        var recorder = recorder();
        var client = tracedClient(response(SECRET, 0.95, Map.of(FIELD, 0.5, "ABSTAIN", 0.5)), recorder, true);
        var state = Map.of("fields", Map.of(SECRET, Map.of("label", "email")));
        var questions = Map.of(SECRET, new JevClient.Choice(JevFieldMappingResolver.instructions(SECRET),
            Map.of(FIELD, "Direct canonical field: " + FIELD, "ABSTAIN", JevFieldMappingResolver.ABSTAIN_CRITERION)));
        assertThat(client.choose(state, questions)).containsEntry(SECRET, "ABSTAIN");
        ArgumentCaptor<Map<String, Object>> outputs = ArgumentCaptor.captor();
        verify(recorder).complete(any(), outputs.capture(), any(), isNull(), eq(200));
        assertThat(firstAnswer(outputs.getValue())).containsEntry("clientSelection", "ABSTAIN")
            .containsEntry("providerChoice", FIELD).containsEntry("confidence", 0.95);
        for (int status : List.of(200, 503)) {
            var failedRecorder = recorder();
            var failed = tracedClient(SECRET, failedRecorder, true);
            setHttp(failed, new FixedResponseHttpClient(SECRET, status));
            assertThatThrownBy(() -> failed.choose(state, questions)).isInstanceOf(ResolverException.class)
                .hasMessage("Jev 분석 응답을 사용할 수 없습니다");
            verify(failedRecorder).complete(any(), eq(Map.of("outcome", "UNAVAILABLE")), eq(Map.of()),
                eq(status == 200 ? "INVALID_RESPONSE_DATA" : "HTTP_ERROR"), eq(status));
        }
    }

    @Test
    void recordsTimeoutWithoutExportingTheTransportMessage() throws Exception {
        var recorder = recorder();
        var client = tracedClient("", recorder, true);
        var http = mock(HttpClient.class);
        when(http.sendAsync(any(HttpRequest.class),
            org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
            .thenReturn(CompletableFuture.failedFuture(new java.net.http.HttpTimeoutException(SECRET)));
        setHttp(client, http);
        assertThatThrownBy(() -> client.choose("safe-state", questions())).isInstanceOf(ResolverException.class);
        verify(recorder).complete(any(), eq(Map.of("outcome", "UNAVAILABLE")), eq(Map.of()),
            eq("TIMEOUT"), isNull());
    }

    @Test
    void disabledTracingDoesNotSerializeProjectionOrUseRecorder() throws Exception {
        var recorder = mock(LangSmithTraceRecorder.class);
        var client = tracedClient(response("decision", 0.9, Map.of("candidate", 0.9, "ABSTAIN", 0.1), "candidate"), recorder, false);
        var reads = new AtomicInteger();
        assertThat(client.choose(new CountedState(reads), questions())).containsEntry("decision", "candidate");
        assertThat(reads.get()).isEqualTo(1);
        verifyNoInteractions(recorder);
    }

    private record CountedState(@com.fasterxml.jackson.annotation.JsonIgnore AtomicInteger reads) {
        @com.fasterxml.jackson.annotation.JsonProperty("label")
        public String label() { reads.incrementAndGet(); return "email"; }
    }

    private static Map<String, Object> firstAnswer(Map<String, Object> outputs) {
        Map<?, ?> answer = (Map<?, ?>) ((List<?>) outputs.get("answers")).getFirst();
        Map<String, Object> result = new LinkedHashMap<>();
        answer.forEach((key, value) -> result.put(String.class.cast(key), value));
        return result;
    }

    private static LangSmithTraceRecorder recorder() {
        var recorder = mock(LangSmithTraceRecorder.class);
        when(recorder.begin(any(), any(), any(), any())).thenReturn(new LangSmithTraceRecorder.Trace(
            "trace", "jev", "fields", "jev-test", null, Instant.EPOCH, 0, Map.of()));
        return recorder;
    }

    private static String response(String id, double confidence, Map<String, Double> probabilities) {
        return response(id, confidence, probabilities, FIELD);
    }

    private static String response(String id, double confidence, Map<String, Double> probabilities, String choice) {
        return JsonMapper.builder().build().writeValueAsString(Map.of("model", SECRET, "answers",
            Map.of(id, Map.of("type", "choice", "choice", choice, "confidence", confidence, "probabilities", probabilities)),
            "usage", Map.of("input_tokens", 7, "output_tokens", 3)));
    }

    private static JevClient tracedClient(String body, LangSmithTraceRecorder recorder, boolean enabled) throws Exception {
        var client = new JevClient("synthetic-key", "jev-test", 8000, 0.8, true, null, recorder, enabled);
        setHttp(client, new FixedResponseHttpClient(body));
        return client;
    }

    private static void setHttp(JevClient client, HttpClient http) throws Exception {
        Field field = JevClient.class.getDeclaredField("http");
        field.setAccessible(true);
        field.set(client, http);
    }


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
        private final int status;

        private FixedResponseHttpClient(String body) { this(body, 200); }
        private FixedResponseHttpClient(String body, int status) {
            this.body = body;
            this.status = status;
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
            return CompletableFuture.completedFuture(response(request, (T) body, status));
        }
        @Override public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request,
            HttpResponse.BodyHandler<T> handler,
            HttpResponse.PushPromiseHandler<T> pushPromiseHandler) {
            throw new UnsupportedOperationException();
        }
        @Override public WebSocket.Builder newWebSocketBuilder() {
            throw new UnsupportedOperationException();
        }

        private static <T> HttpResponse<T> response(HttpRequest request, T body, int status) {
            return new HttpResponse<>() {
                @Override public int statusCode() { return status; }
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
