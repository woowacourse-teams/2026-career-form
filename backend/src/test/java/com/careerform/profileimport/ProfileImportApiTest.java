package com.careerform.profileimport;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import io.micrometer.core.instrument.MeterRegistry;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** 실제 Tomcat, 요청 관측 필터, LangSmith 기록기를 거치고 OpenAI와 LangSmith만 로컬 대역으로 바꾼다. 원문은 모두 합성값이다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test?serverSelectionTimeoutMS=200",
    "career-form.llm.enabled=false",
    "management.health.mongodb.enabled=false",
    "logging.level.org.springframework.web=DEBUG",
    "logging.level.com.careerform=DEBUG",
    "career-form.profile-import.openai.api-key=" + ProfileImportApiTest.KEY,
    "career-form.profile-import.openai.model=" + ProfileImportApiTest.MODEL,
    "career-form.profile-import.openai.timeout-ms=5000",
    "career-form.profile-import.rate-limit.max-requests=1000",
    "career-form.tracing.langsmith.enabled=true",
    "career-form.tracing.langsmith.api-key=SYNTHETIC-LANGSMITH-KEY-469",
    "career-form.tracing.langsmith.project=cf469-test"
})
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@ExtendWith(OutputCaptureExtension.class)
@DisplayName("이력서 글자 프로필 초안 API")
class ProfileImportApiTest {
    static final String KEY = "SYNTHETIC-OPENAI-KEY-469";
    static final String MODEL = "gpt-synthetic-469";
    private static final String PATH = "/api/v1/profile-import/resume";
    private static final String UNEXTRACTED_SENTENCE = "SYNTHETIC-UNEXTRACTED-SENTENCE-469";
    private static final String UPSTREAM_MESSAGE = "SYNTHETIC-UPSTREAM-MESSAGE-469";
    private static final String RESUME = """
        합성 이력서 SYNTHETIC-RESUME-469
        이름 홍합성 / 연락처 010-0000-1469 / synthetic.469@example.test
        학력: 합성고등학교 졸업, 합성대학교 합성공학과 2015-03-02 입학 2019-02-20 졸업
        경력: 합성상사 2019-03-04 ~ 2021-06-30, 합성전자 플랫폼팀 2021-07-01 ~ 현재
        자격: 합성정보기사 2018-11-16 취득, 합성관리사 2급
        어학: TOEIC 905, OPIc IH
        %s
        """.formatted(UNEXTRACTED_SENTENCE);
    /** 응답에 들어가는 값. 로그, 트레이스, 지표에는 하나도 나오면 안 된다. */
    private static final List<String> EXTRACTED = List.of("홍합성", "01000001469", "synthetic.469@example.test",
        "합성고등학교", "합성대학교", "합성공학과", "합성상사", "합성전자", "플랫폼팀", "합성정보기사", "합성관리사");
    private static final String INVENTED = "SYNTHETIC-INVENTED-COMPANY";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final List<String> UPSTREAM_BODIES = new CopyOnWriteArrayList<>();
    private static final List<String> UPSTREAM_AUTHORIZATION = new CopyOnWriteArrayList<>();
    private static final BlockingQueue<JsonNode> TRACES = new LinkedBlockingQueue<>();
    private static final HttpServer UPSTREAM = startUpstream();
    private static volatile Stub stub = exchange -> respond(exchange, 200, completion("{}", "stop"));

    @FunctionalInterface
    private interface Stub {
        void handle(HttpExchange exchange) throws IOException;
    }

    @LocalServerPort private int port;
    @Autowired private MeterRegistry meters;
    @Autowired private ConfigurableApplicationContext context;
    @MockitoBean private FormAnalysisCompanyMongoRepository companies;

    private static HttpServer startUpstream() {
        try {
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/v1/chat/completions", exchange -> {
                UPSTREAM_AUTHORIZATION.add(String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")));
                UPSTREAM_BODIES.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                stub.handle(exchange);
            });
            server.createContext("/api/v1/runs", exchange -> {
                TRACES.add(JSON.readTree(exchange.getRequestBody().readAllBytes()));
                respond(exchange, 200, "{}");
            });
            server.setExecutor(Executors.newCachedThreadPool());
            server.start();
            return server;
        } catch (IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    @DynamicPropertySource
    static void upstream(DynamicPropertyRegistry registry) {
        var base = "http://127.0.0.1:" + UPSTREAM.getAddress().getPort();
        registry.add("career-form.profile-import.openai.endpoint", () -> base + "/v1/chat/completions");
        registry.add("career-form.tracing.langsmith.endpoint", () -> base);
    }

    @AfterAll
    static void stopUpstream() {
        UPSTREAM.stop(0);
    }

    @BeforeEach
    void reset() {
        UPSTREAM_BODIES.clear();
        UPSTREAM_AUTHORIZATION.clear();
        stub = exchange -> respond(exchange, 200, completion("{}", "stop"));
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        var bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json;charset=UTF-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private static String completion(String content, String finishReason) {
        ObjectNode root = JSON.createObjectNode();
        root.put("id", "chatcmpl-synthetic");
        root.put("model", MODEL);
        var choice = root.putArray("choices").addObject();
        choice.put("index", 0);
        choice.put("finish_reason", finishReason);
        choice.putObject("message").put("role", "assistant").put("content", content);
        root.putObject("usage").put("prompt_tokens", 321).put("completion_tokens", 123).put("total_tokens", 444);
        return root.toString();
    }

    private static String draft() {
        return """
            {"personal":{"koreanFamilyName":"홍","koreanGivenName":"합성","bloodType":"A"},
             "contact":{"phoneNumber":"010-0000-1469","email":"synthetic.469@example.test"},
             "education":[
               {"sectionId":"highSchool","values":{"schoolName":"합성고등학교","completionStatus":"졸업"}},
               {"sectionId":"university","values":{"schoolName":"합성대학교","majorName":"합성공학과",
                 "startDate":"2015-03-02","endDate":"2019-02-20","completionStatus":"졸업"}}],
             "careers":[
               {"sectionId":"career","values":{"companyName":"합성상사","startDate":"2019-03-04","endDate":"2021-06-30",
                 "employmentStatus":"퇴직"}},
               {"sectionId":"career","values":{"companyName":"합성전자","department":"플랫폼팀","startDate":"2021-07-01",
                 "employmentStatus":"재직중"}},
               {"sectionId":"career","values":{"companyName":"%s"}}],
             "certifications":[
               {"sectionId":"certificate","values":{"name":"합성정보기사","acquisitionDate":"2018-11-16"}},
               {"sectionId":"certificate","values":{"name":"합성관리사","grade":"2급"}}],
             "languages":[
               {"sectionId":"languageTest","values":{"testName":"TOEIC","grade":"905"}},
               {"sectionId":"languageTest","values":{"testName":"OPIc","grade":"IH"}}]}
            """.formatted(INVENTED);
    }

    private HttpResponse<String> post(String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + PATH))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
        return HTTP.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private HttpResponse<String> postText(String text) throws Exception {
        ObjectNode body = JSON.createObjectNode();
        body.put("text", text);
        return post(body.toString());
    }

    private static List<String> resultLines(CapturedOutput output) {
        return output.getOut().lines().filter(line -> line.contains("PROFILE_IMPORT_RESULT")).toList();
    }

    private static JsonNode traceFor(String requestId) throws InterruptedException {
        var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (true) {
            var remaining = deadline - System.nanoTime();
            var run = remaining <= 0 ? null : TRACES.poll(remaining, TimeUnit.NANOSECONDS);
            if (run == null) throw new AssertionError("profile import trace was not delivered");
            if (requestId.equals(run.path("extra").path("metadata").path("request_id").asString())
                && run.path("name").asString().equals("openai.PROFILE_IMPORT")) return run;
        }
    }

    private void assertNoPrivateValue(HttpResponse<String> response, CapturedOutput output, JsonNode trace) {
        var forbidden = new ArrayList<String>(EXTRACTED);
        forbidden.addAll(List.of(UNEXTRACTED_SENTENCE, "SYNTHETIC-RESUME-469", INVENTED, UPSTREAM_MESSAGE, KEY));
        var everywhere = output.getAll() + "\n" + (trace == null ? "" : trace.toString()) + "\n"
            + response.headers().map();
        var meterIds = new ArrayList<String>();
        meters.getMeters().forEach(meter -> meterIds.add(meter.getId().toString()));
        everywhere += String.join("\n", meterIds);
        for (var value : forbidden) {
            assertThat(everywhere).as("private value must stay out of logs, traces and meters").doesNotContain(value);
        }
        assertThat(response.body()).doesNotContain(UNEXTRACTED_SENTENCE, INVENTED, UPSTREAM_MESSAGE, KEY);
    }

    @Test
    @DisplayName("합성 이력서를 보내면 묶음 항목을 여러 건으로 나눈 프로필 초안을 돌려주고 모델에 없는 키와 원문에 없는 값은 뺀다")
    void returnsProfileDraft(CapturedOutput output) throws Exception {
        stub = exchange -> respond(exchange, 200, completion(draft(), "stop"));

        var response = postText(RESUME);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).hasValue("no-store");
        var body = JSON.readTree(response.body());
        assertThat(body.path("schemaVersion").asInt()).isEqualTo(1);
        var profile = body.path("profile");
        assertThat(profile.properties().stream().map(Map.Entry::getKey).toList()).containsExactly(
            "personal", "contact", "education", "languages", "certifications", "careers", "projects",
            "publications", "compensation", "military", "veteran", "disability", "health");
        assertThat(profile.path("personal").path("koreanFamilyName").asString()).isEqualTo("홍");
        assertThat(profile.path("personal").has("bloodType")).isFalse();
        assertThat(profile.path("contact").path("phoneNumber").asString()).isEqualTo("01000001469");
        assertThat(profile.path("education")).hasSize(2);
        assertThat(profile.path("education").get(0).path("sectionId").asString()).isEqualTo("highSchool");
        assertThat(profile.path("education").get(1).path("values").path("schoolName").asString()).isEqualTo("합성대학교");
        assertThat(profile.path("careers")).hasSize(2);
        assertThat(profile.path("careers").get(1).path("values").path("employmentStatus").asString()).isEqualTo("재직중");
        assertThat(profile.path("certifications")).hasSize(2);
        assertThat(profile.path("languages")).hasSize(2);
        assertThat(profile.path("projects")).isEmpty();
        assertThat(profile.path("military").isObject()).isTrue();
        assertThat(profile.path("military")).isEmpty();
        assertThat(profile.path("careers").get(0).has("id")).isFalse();

        var sent = JSON.readTree(UPSTREAM_BODIES.getFirst());
        assertThat(UPSTREAM_BODIES).hasSize(1);
        assertThat(UPSTREAM_AUTHORIZATION).containsExactly("Bearer " + KEY);
        assertThat(sent.path("model").asString()).isEqualTo(MODEL);
        assertThat(sent.path("store").asBoolean(true)).isFalse();
        assertThat(sent.path("response_format").path("type").asString()).isEqualTo("json_object");
        assertThat(sent.path("messages").get(1).path("content").asString()).isEqualTo(RESUME.strip());

        var requestId = response.headers().firstValue("X-Request-Id").orElseThrow();
        assertThat(resultLines(output)).singleElement().satisfies(line -> assertThat(line).contains(
            "result=OK", "inputChars=" + RESUME.strip().length(), "personal=2", "contact=2", "education=2",
            "languages=2", "certifications=2", "careers=2", "projects=0", "droppedKeys=1", "droppedValues=1",
            "model=" + MODEL, "durationMs=", "failure=NONE", "requestId=" + requestId));

        var trace = traceFor(requestId);
        assertThat(trace.path("inputs").path("inputChars").asInt()).isEqualTo(RESUME.strip().length());
        assertThat(trace.path("outputs").path("result").asString()).isEqualTo("OK");
        assertThat(trace.path("outputs").path("extracted").path("education").asInt()).isEqualTo(2);
        assertThat(trace.path("outputs").path("extracted").path("careers").asInt()).isEqualTo(2);
        assertThat(trace.path("outputs").path("droppedKeys").asInt()).isEqualTo(1);
        assertThat(trace.path("outputs").path("droppedValues").asInt()).isEqualTo(1);
        assertThat(trace.path("outputs").path("model").asString()).isEqualTo(MODEL);
        assertThat(trace.path("outputs").path("usage_metadata").path("input_tokens").asInt()).isEqualTo(321);
        assertThat(trace.path("extra").path("metadata").path("duration_ms").isNumber()).isTrue();
        assertThat(trace.path("extra").path("metadata").path("ls_model_name").asString()).isEqualTo(MODEL);
        assertThat(trace.has("error")).isFalse();
        assertThat(output.getAll()).contains("provider=openai operation=profile-import outcome=success");
        assertNoPrivateValue(response, output, trace);
    }

    @Test
    @DisplayName("빈 입력과 text가 없는 본문은 모델을 부르지 않고 RESUME_TEXT_EMPTY로 거절한다")
    void rejectsEmptyInput(CapturedOutput output) throws Exception {
        var blank = postText(" \n\t ");
        var missing = post("{}");

        assertThat(blank.statusCode()).isEqualTo(400);
        assertThat(JSON.readTree(blank.body())).isEqualTo(JSON.readTree("{\"error\":\"RESUME_TEXT_EMPTY\"}"));
        assertThat(missing.statusCode()).isEqualTo(400);
        assertThat(JSON.readTree(missing.body())).isEqualTo(JSON.readTree("{\"error\":\"RESUME_TEXT_EMPTY\"}"));
        assertThat(UPSTREAM_BODIES).isEmpty();
        assertThat(resultLines(output)).hasSize(2).allSatisfy(line -> assertThat(line)
            .contains("result=EMPTY_INPUT", "inputChars=0", "droppedKeys=0", "model=" + MODEL));
        var trace = traceFor(blank.headers().firstValue("X-Request-Id").orElseThrow());
        assertThat(trace.path("outputs").path("result").asString()).isEqualTo("EMPTY_INPUT");
        assertThat(trace.path("error").asString()).isEqualTo("EMPTY_INPUT");
    }

    @Test
    @DisplayName("읽을 수 없는 본문은 INVALID_INPUT으로 거절하고 본문 조각을 기록하지 않는다")
    void rejectsMalformedBody(CapturedOutput output) throws Exception {
        var response = post("{\"text\":\"" + UNEXTRACTED_SENTENCE);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(JSON.readTree(response.body())).isEqualTo(JSON.readTree("{\"error\":\"INVALID_INPUT\"}"));
        assertThat(UPSTREAM_BODIES).isEmpty();
        assertThat(resultLines(output)).singleElement().satisfies(line -> assertThat(line).contains("result=INVALID_INPUT"));
        assertNoPrivateValue(response, output, null);
    }

    @Test
    @DisplayName("상한 20000자를 넘으면 모델을 부르지 않고 RESUME_TEXT_TOO_LONG과 상한을 돌려준다")
    void rejectsTooLongInput(CapturedOutput output) throws Exception {
        var atLimit = postText("가".repeat(20_000));
        assertThat(atLimit.statusCode()).isEqualTo(200);
        UPSTREAM_BODIES.clear();

        var response = postText("가".repeat(20_001));

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(JSON.readTree(response.body())).isEqualTo(
            JSON.readTree("{\"error\":\"RESUME_TEXT_TOO_LONG\",\"maxLength\":20000}"));
        assertThat(UPSTREAM_BODIES).isEmpty();
        assertThat(resultLines(output)).last().satisfies(line -> assertThat(line)
            .contains("result=TOO_LONG", "inputChars=20001"));
    }

    @Test
    @DisplayName("모델 HTTP 오류, 읽을 수 없는 응답, 출력 길이 초과는 PROFILE_IMPORT_UNAVAILABLE로 알리고 실패 분류만 기록한다")
    void reportsModelFailure(CapturedOutput output) throws Exception {
        stub = exchange -> respond(exchange, 500, "{\"error\":{\"message\":\"" + UPSTREAM_MESSAGE + "\"}}");
        var httpError = postText(RESUME);
        stub = exchange -> respond(exchange, 200, completion("not json " + UPSTREAM_MESSAGE, "stop"));
        var invalid = postText(RESUME);
        stub = exchange -> respond(exchange, 200, completion("{\"personal\":", "length"));
        var truncated = postText(RESUME);

        for (var response : List.of(httpError, invalid, truncated)) {
            assertThat(response.statusCode()).isEqualTo(502);
            assertThat(JSON.readTree(response.body())).isEqualTo(
                JSON.readTree("{\"error\":\"PROFILE_IMPORT_UNAVAILABLE\"}"));
        }
        assertThat(resultLines(output)).hasSize(3);
        assertThat(resultLines(output).get(0)).contains("result=LLM_FAILED", "failure=HTTP_ERROR", "llmStatus=500");
        assertThat(resultLines(output).get(1)).contains("result=LLM_FAILED", "failure=INVALID_RESPONSE");
        assertThat(resultLines(output).get(2)).contains("result=LLM_FAILED", "failure=OUTPUT_LIMIT");
        var trace = traceFor(httpError.headers().firstValue("X-Request-Id").orElseThrow());
        assertThat(trace.path("error").asString()).isEqualTo("HTTP_ERROR");
        assertThat(trace.path("extra").path("metadata").path("http_status").asInt()).isEqualTo(500);
        assertThat(output.getAll()).contains("provider=openai operation=profile-import outcome=failure");
        assertNoPrivateValue(httpError, output, trace);
    }

    @Test
    @DisplayName("이 API의 빈 의존 관계에는 DB 저장소가 없다")
    void neverReachesPersistence() {
        var factory = context.getBeanFactory();
        assertThat(factory.containsBean("profileImportController")).isTrue();
        assertThat(factory.containsBean("profileImportService")).isTrue();
        var seen = new HashSet<String>();
        var pending = new ArrayList<>(List.of("profileImportController", "profileImportService"));
        while (!pending.isEmpty()) {
            var name = pending.removeLast();
            if (!seen.add(name) || !factory.containsBean(name)) continue;
            pending.addAll(List.of(factory.getDependenciesForBean(name)));
        }
        Set<String> types = new HashSet<>();
        for (var name : seen) {
            if (!factory.containsBean(name)) continue;
            var type = factory.getType(name);
            if (type != null) types.add(type.getName());
        }
        assertThat(seen).contains("profileImportController", "profileImportService");
        assertThat(types).noneMatch(type -> type.contains("mongo") || type.contains("Mongo")
            || type.startsWith("com.careerform.quality"));
    }
}
