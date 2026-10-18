package com.careerform.formanalysis.generic;

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
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Flow;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Item;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Section;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;

/** 모의 JEV HTTP. 공급자 요청 본문을 캡처하고 호출한 스레드에서 응답을 만든다. */
final class GenericFieldsJevHttp extends HttpClient {

    static final JsonMapper JSON = JsonMapper.builder().build();
    static final SupportedProfileFields FIELDS = new SupportedProfileFields();
    static final SectionCategories CATEGORIES = new SectionCategories(FIELDS);

    record Call(JsonNode request, Thread thread) {
        List<String> questionIds() {
            List<String> ids = new ArrayList<>();
            request.path("questions").propertyNames().forEach(ids::add);
            return ids;
        }

        List<String> criteria(String questionId) {
            List<String> keys = new ArrayList<>();
            request.path("questions").path(questionId).path("criteria").propertyNames().forEach(keys::add);
            return keys;
        }

        JsonNode state() {
            return request.path("state");
        }

        String category() {
            return state().path("section").path("category").asString();
        }
    }

    record Reply(int status, String body) {
    }

    @FunctionalInterface
    interface Responder {
        Reply reply(Call call) throws Exception;
    }

    private final List<String> bodies = Collections.synchronizedList(new ArrayList<>());
    private final List<Call> calls = Collections.synchronizedList(new ArrayList<>());
    private volatile Responder responder = call -> answerAll(call, null, 0.9);

    static JevClient client(GenericFieldsJevHttp http) {
        JevClient client = new JevClient("synthetic-test-key", "jev-test", 8000, 0.8, true);
        install(client, http);
        return client;
    }

    static void install(JevClient client, GenericFieldsJevHttp http) {
        try {
            Field field = JevClient.class.getDeclaredField("http");
            field.setAccessible(true);
            field.set(client, http);
        }
        catch (ReflectiveOperationException exception) {
            throw new IllegalStateException(exception);
        }
    }

    void respond(Responder responder) {
        this.responder = responder;
    }

    List<String> bodies() {
        synchronized (bodies) {
            return List.copyOf(bodies);
        }
    }

    List<Call> calls() {
        synchronized (calls) {
            return List.copyOf(calls);
        }
    }

    /** 질문마다 choice가 선택지에 있으면 그 키, 없으면 ABSTAIN을 고른 성공 응답. */
    static Reply answerAll(Call call, String choice, double confidence) {
        Map<String, String> choices = new LinkedHashMap<>();
        call.questionIds().forEach(id -> choices.put(id, choice));
        return answers(call, choices, confidence);
    }

    static Reply answers(Call call, Map<String, String> choices, double confidence) {
        Map<String, Object> answers = new LinkedHashMap<>();
        for (String id : call.questionIds()) {
            List<String> criteria = call.criteria(id);
            String wanted = choices.get(id);
            String selected = wanted != null && criteria.contains(wanted) ? wanted : JevClient.ABSTAIN;
            Map<String, Double> probabilities = new LinkedHashMap<>();
            criteria.forEach(key -> probabilities.put(key, 0.0));
            probabilities.put(selected, 1.0);
            answers.put(id, Map.of("type", "choice", "choice", selected, "confidence", confidence,
                "probabilities", probabilities));
        }
        return new Reply(200, JSON.writeValueAsString(Map.of("model", "jev-test", "answers", answers,
            "usage", Map.of("input_tokens", 11, "output_tokens", 3))));
    }

    static Reply tokenLimit() {
        return new Reply(400, "{\"error_type\":\"max_tokens_exceeded\"}");
    }

    static FieldCandidate field(String candidateId, String label) {
        return new FieldCandidate(candidateId, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, label,
            null, null, null, null, null, null, null);
    }

    static Section section(String sectionId, String category, List<FieldCandidate> fields) {
        return new Section(sectionId, null, "학력", fields, null, category);
    }

    static Section repeatedSection(String sectionId, String category, List<Item> items) {
        return new Section(sectionId, null, "학력", List.of(), items, category);
    }

    static GenericFieldsRequest request(String host, List<Section> sections) {
        return new GenericFieldsRequest(2, "synthetic-snapshot",
            new GenericFieldsRequest.Site(host, "/apply"), sections);
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

    @SuppressWarnings("unchecked")
    @Override public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request,
        HttpResponse.BodyHandler<T> handler) {
        String body = bodyOf(request);
        bodies.add(body);
        Call call = new Call(JSON.readTree(body), Thread.currentThread());
        calls.add(call);
        Reply reply;
        try {
            reply = responder.reply(call);
        }
        catch (Exception exception) {
            return CompletableFuture.failedFuture(exception);
        }
        return CompletableFuture.completedFuture(response(request, (T) reply.body(), reply.status()));
    }

    @Override public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request,
        HttpResponse.BodyHandler<T> handler, HttpResponse.PushPromiseHandler<T> pushPromiseHandler) {
        throw new UnsupportedOperationException();
    }

    @Override public WebSocket.Builder newWebSocketBuilder() { throw new UnsupportedOperationException(); }

    private static String bodyOf(HttpRequest request) {
        var collected = new java.io.ByteArrayOutputStream();
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<>() {
            @Override public void onSubscribe(Flow.Subscription subscription) { subscription.request(Long.MAX_VALUE); }
            @Override public void onNext(ByteBuffer item) {
                byte[] bytes = new byte[item.remaining()];
                item.get(bytes);
                collected.writeBytes(bytes);
            }
            @Override public void onError(Throwable throwable) { throw new IllegalStateException(throwable); }
            @Override public void onComplete() { }
        });
        return collected.toString(StandardCharsets.UTF_8);
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
