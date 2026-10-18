package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Flow;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import tools.jackson.databind.json.JsonMapper;

import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.analysis.enabled=true",
    "career-form.analysis.provider=jev",
    "career-form.analysis.jev.api-key=synthetic-test-key",
    "career-form.analysis.jev.data-policy-reviewed=true"
})
@AutoConfigureMockMvc
@Import(SectionClassificationApiTest.SyntheticPolicyConfiguration.class)
@DisplayName("범용 섹션 분류 API")
class SectionClassificationApiTest {

    private static final String SYNTHETIC_PROFILE_VALUE = "SYNTHETIC_PRIVATE_8421";
    private static final String SYNTHETIC_CURRENT_VALUE = "SYNTHETIC_CURRENT_5513";
    private static final String STATIC_HOST = "static-policy.example.test";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JevClient jevClient;

    @Autowired
    private SectionCategories categories;

    private CapturingHttpClient http;

    @BeforeEach
    void captureJevHttp() throws Exception {
        http = new CapturingHttpClient();
        Field field = JevClient.class.getDeclaredField("http");
        field.setAccessible(true);
        field.set(jevClient, http);
    }

    @Test
    @DisplayName("JEV answer 결과를 섹션별 범주와 확신도로 돌려주고 공급자 요청에는 값과 개수를 보내지 않는다")
    void classifiesThroughAnswerWithoutSendingValues() throws Exception {
        http.reply(200, providerResponse(Map.of(
            "section_0", answer("EDUCATION", 0.55, 1.0),
            "section_1", answer("LANGUAGE", 0.9, 0.97))));

        mockMvc.perform(post("/api/v1/generic/sections/classify")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestJson("example.test")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("COMPLETE"))
            .andExpect(jsonPath("$.snapshotId").value("synthetic-snapshot"))
            .andExpect(jsonPath("$.sections.length()").value(2))
            .andExpect(jsonPath("$.sections[0].sectionId").value("edu-block"))
            .andExpect(jsonPath("$.sections[0].category").value("EDUCATION"))
            .andExpect(jsonPath("$.sections[0].confidence").value(0.55))
            .andExpect(jsonPath("$.sections[1].sectionId").value("lang-block"))
            .andExpect(jsonPath("$.sections[1].category").value("LANGUAGE"));

        assertThat(http.bodies()).hasSize(1);
        String body = http.bodies().getFirst();
        assertThat(body).doesNotContain(SYNTHETIC_PROFILE_VALUE, SYNTHETIC_CURRENT_VALUE,
            "profileItemCount", "currentValue", "\"value\"", "edu-block", "lang-block");
        var sent = JSON.readTree(body);
        assertThat(sent.path("questions").propertyNames()).containsExactly("section_0", "section_1");
        assertThat(sent.path("questions").path("section_0").path("criteria").propertyNames())
            .containsExactlyInAnyOrderElementsOf(categories.names());
        assertThat(sent.path("questions").path("section_0").path("instructions").asString())
            .contains("other people", "PROJECT", "overseas", "award");
        assertThat(sent.path("state").path("sections").path("section_0").path("labels").toString())
            .contains("school name");
    }

    @Test
    @DisplayName("정적 정책 host 요청은 JEV를 호출하지 않고 STATIC_POLICY_PRESENT를 반환한다")
    void staticPolicyHostDoesNotCallJev() throws Exception {
        mockMvc.perform(post("/api/v1/generic/sections/classify")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestJson(STATIC_HOST)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("STATIC_POLICY_PRESENT"))
            .andExpect(jsonPath("$.sections.length()").value(0));

        assertThat(http.bodies()).isEmpty();
    }

    @Test
    @DisplayName("JEV 장애와 토큰 한도 초과는 분할 재시도 없이 섹션별 ABSTAIN으로 응답한다")
    void providerFailureAbstainsEachSectionWithoutSplitRetry() throws Exception {
        for (var failure : List.of(Map.entry(503, "{}"),
            Map.entry(400, "{\"error_type\":\"max_tokens_exceeded\"}"))) {
            captureJevHttp();
            http.reply(failure.getKey(), failure.getValue());

            mockMvc.perform(post("/api/v1/generic/sections/classify")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson("example.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETE"))
                .andExpect(jsonPath("$.sections[0].category").value("ABSTAIN"))
                .andExpect(jsonPath("$.sections[1].category").value("ABSTAIN"));

            assertThat(http.bodies()).hasSize(1);
        }
    }

    @Test
    @DisplayName("값 필드 없이 구조가 잘못된 요청은 400으로 거부한다")
    void rejectsMalformedStructure() throws Exception {
        mockMvc.perform(post("/api/v1/generic/sections/classify")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"schemaVersion\":1,\"snapshotId\":\"synthetic-snapshot\","
                    + "\"site\":{\"host\":\"example.test\",\"pathPattern\":\"/apply\"},\"sections\":[]}"))
            .andExpect(status().isBadRequest());
        assertThat(http.bodies()).isEmpty();
    }

    @Test
    @DisplayName("프로필 값, 현재 입력값, 항목 개수 필드를 담은 요청은 400으로 거부하고 JEV를 호출하지 않는다")
    void rejectsValueFieldsAtTheBoundary() throws Exception {
        mockMvc.perform(post("/api/v1/generic/sections/classify")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestJson("example.test", true)))
            .andExpect(status().isBadRequest());
        assertThat(http.bodies()).isEmpty();
    }

    private String requestJson(String host) {
        return requestJson(host, false);
    }

    private String requestJson(String host, boolean withValues) {
        var education = new LinkedHashMap<String, Object>();
        education.put("sectionId", "edu-block");
        education.put("title", "학력 " + SYNTHETIC_PROFILE_VALUE);
        education.put("labels", List.of("학교명", "주전공명 " + SYNTHETIC_PROFILE_VALUE));
        education.put("controlKinds", List.of("TEXT", "SELECT"));
        education.put("repeated", true);
        if (withValues) {
            education.put("value", SYNTHETIC_PROFILE_VALUE);
            education.put("currentValue", SYNTHETIC_CURRENT_VALUE);
        }
        var language = new LinkedHashMap<String, Object>();
        language.put("sectionId", "lang-block");
        language.put("parentSectionId", "edu-block");
        language.put("labels", List.of("외국어", "시험명", "등급"));
        language.put("controlKinds", List.of("TEXT"));
        language.put("repeated", false);
        var request = new LinkedHashMap<String, Object>();
        request.put("schemaVersion", 1);
        request.put("snapshotId", "synthetic-snapshot");
        request.put("site", Map.of("host", host, "pathPattern", "/apply"));
        if (withValues) {
            request.put("profileItemCount", 7);
        }
        request.put("sections", List.of(education, language));
        return JSON.writeValueAsString(request);
    }

    private Map<String, Object> answer(String choice, double confidence, double total) {
        Map<String, Double> probabilities = new LinkedHashMap<>();
        categories.names().forEach(name -> probabilities.put(name, 0.0));
        probabilities.put(choice, total - 0.05);
        probabilities.put("ABSTAIN", 0.05);
        return Map.of("type", "choice", "choice", choice, "confidence", confidence,
            "probabilities", probabilities);
    }

    private static String providerResponse(Map<String, Object> answers) {
        return JSON.writeValueAsString(Map.of("model", "jev-test", "answers", answers,
            "usage", Map.of("input_tokens", 11, "output_tokens", 3)));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class SyntheticPolicyConfiguration {
        @Bean
        @Primary
        CompanyFormPolicyProvider syntheticCompanyFormPolicyProvider() {
            return (host, path) -> STATIC_HOST.equals(host)
                ? new CompanyFormPolicyProvider.Available(CompanyFormPolicyFixture.sk())
                : new CompanyFormPolicyProvider.NotRegistered();
        }

        @Bean
        @Primary
        GreetingDomainEvidence syntheticGreetingDomainEvidence() {
            return (host, path) -> GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE;
        }
    }

    private static final class CapturingHttpClient extends HttpClient {
        private final List<String> bodies = new ArrayList<>();
        private int status = 503;
        private String reply = "{}";

        void reply(int status, String reply) {
            this.status = status;
            this.reply = reply;
        }

        List<String> bodies() {
            return bodies;
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
            bodies.add(bodyOf(request));
            return CompletableFuture.completedFuture(response(request, (T) reply, status));
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
}
