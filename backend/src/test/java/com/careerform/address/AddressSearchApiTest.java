package com.careerform.address;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.logging.LogLevel;
import org.springframework.boot.logging.LoggingSystem;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import io.micrometer.core.instrument.MeterRegistry;
import tools.jackson.databind.json.JsonMapper;

/** 실제 Tomcat과 요청 관측 필터를 거치고 외부 API만 로컬 대역으로 바꾼다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test?serverSelectionTimeoutMS=200",
    "career-form.llm.enabled=false",
    "management.health.mongodb.enabled=false",
    "logging.level.org.springframework.web=DEBUG",
    "logging.level.com.careerform.address=DEBUG",
    "career-form.address.juso.api-key=" + AddressSearchApiTest.KEY,
    "career-form.address.juso.timeout-ms=2000",
    "career-form.address.rate-limit.max-requests=1000"
})
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@ExtendWith(OutputCaptureExtension.class)
@DisplayName("주소 검색 프록시 API")
class AddressSearchApiTest {
    static final String KEY = "SYNTHETIC-JUSO-KEY-392";
    private static final String QUERY = "SYNTHETIC-ADDR-QUERY-392";
    private static final String UPSTREAM_MESSAGE = "SYNTHETIC-UPSTREAM-MESSAGE-392";
    private static final String UNAVAILABLE = "{\"error\":\"ADDRESS_SEARCH_UNAVAILABLE\"}";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final HttpServer UPSTREAM = startUpstream();
    private static final List<String> UPSTREAM_BODIES = new CopyOnWriteArrayList<>();
    private static final List<String> UPSTREAM_URIS = new CopyOnWriteArrayList<>();
    private static final List<String> UPSTREAM_METHODS = new CopyOnWriteArrayList<>();
    private static final CountDownLatch NEVER_RELEASED_UNTIL_SHUTDOWN = new CountDownLatch(1);
    private static volatile Stub stub = exchange -> respond(exchange, 200, "{}");

    @FunctionalInterface
    private interface Stub {
        void handle(HttpExchange exchange) throws IOException;
    }

    @LocalServerPort private int port;
    @Autowired private MeterRegistry meters;
    @MockitoBean private FormAnalysisCompanyMongoRepository companies;

    private static HttpServer startUpstream() {
        try {
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/addrlink/addrLinkApi.do", exchange -> {
                UPSTREAM_METHODS.add(exchange.getRequestMethod());
                UPSTREAM_URIS.add(exchange.getRequestURI().toString());
                UPSTREAM_BODIES.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                stub.handle(exchange);
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
        registry.add("career-form.address.juso.base-url",
            () -> "http://127.0.0.1:" + UPSTREAM.getAddress().getPort() + "/addrlink/addrLinkApi.do");
    }

    @AfterAll
    static void stopUpstream() {
        NEVER_RELEASED_UNTIL_SHUTDOWN.countDown();
        UPSTREAM.stop(0);
    }

    @BeforeEach
    void resetUpstream() {
        UPSTREAM_BODIES.clear();
        UPSTREAM_URIS.clear();
        UPSTREAM_METHODS.clear();
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        var bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json;charset=UTF-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private static String success() {
        return """
            {"results":{"common":{"errorCode":"0","errorMessage":"정상","totalCount":"11","currentPage":"2","countPerPage":"10"},
            "juso":[{"zipNo":"00000","roadAddr":"합성시 합성로 1 (합성동)","roadAddrPart1":"합성시 합성로 1","roadAddrPart2":"(합성동)",
            "jibunAddr":"합성시 합성동 1-1","bdMgtSn":"0000000000000000000000000"}]}}
            """;
    }

    private HttpResponse<String> post(String body, Map<String, String> headers) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/address/search"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        headers.forEach(builder::header);
        return HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private HttpResponse<String> search() throws Exception {
        return post("{\"query\":\"" + QUERY + " 합성로\",\"page\":1}", Map.of());
    }

    private static Map<String, String> form(String body) {
        return Arrays.stream(body.split("&")).map(pair -> pair.split("=", 2)).collect(Collectors.toMap(
            pair -> pair[0], pair -> URLDecoder.decode(pair.length > 1 ? pair[1] : "", StandardCharsets.UTF_8)));
    }

    private void assertNoPrivateValue(HttpResponse<String> response, CapturedOutput output) {
        assertThat(response.body()).doesNotContain(QUERY, KEY, UPSTREAM_MESSAGE);
        assertThat(output.getAll()).doesNotContain(QUERY, KEY, UPSTREAM_MESSAGE);
        var meterIds = new ArrayList<String>();
        meters.getMeters().forEach(meter -> meterIds.add(meter.getId().toString()));
        assertThat(String.join("\n", meterIds)).doesNotContain(QUERY, KEY, UPSTREAM_MESSAGE);
    }

    @Test
    @DisplayName("유효한 검색어로 호출하면 우편번호·도로명·지번·건물관리번호 목록과 페이지 정보를 돌려준다")
    void returnsAddresses(CapturedOutput output) throws Exception {
        stub = exchange -> respond(exchange, 200, success());

        var response = post("{\"query\":\"  " + QUERY + " 합성로  \",\"page\":2}", Map.of());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).hasValue("no-store");
        var body = JSON.readTree(response.body());
        assertThat(body.path("page").asInt()).isEqualTo(2);
        assertThat(body.path("pageSize").asInt()).isEqualTo(10);
        assertThat(body.path("totalCount").asInt()).isEqualTo(11);
        var address = body.path("addresses").get(0);
        assertThat(address.path("postalCode").asString()).isEqualTo("00000");
        assertThat(address.path("roadAddress").asString()).isEqualTo("합성시 합성로 1 (합성동)");
        assertThat(address.path("jibunAddress").asString()).isEqualTo("합성시 합성동 1-1");
        assertThat(address.path("buildingManagementNumber").asString()).isEqualTo("0000000000000000000000000");
        assertThat(UPSTREAM_METHODS).containsExactly("POST");
        assertThat(UPSTREAM_URIS).containsExactly("/addrlink/addrLinkApi.do");
        assertThat(form(UPSTREAM_BODIES.getFirst())).containsOnly(
            Map.entry("confmKey", KEY), Map.entry("currentPage", "2"), Map.entry("countPerPage", "10"),
            Map.entry("keyword", QUERY + " 합성로"), Map.entry("resultType", "json"));
        assertThat(output.getAll()).contains("route=/api/v1/address/search", "provider=juso", "outcome=success");
        assertNoPrivateValue(response, output);
    }

    @Test
    @DisplayName("page를 생략하면 1페이지를 찾고 결과가 없으면 juso가 null이어도 빈 목록을 돌려준다")
    void defaultsPageAndAcceptsEmptyResult() throws Exception {
        stub = exchange -> respond(exchange, 200, """
            {"results":{"common":{"errorCode":"0","errorMessage":"정상","totalCount":"0","currentPage":"1","countPerPage":"10"},"juso":null}}
            """);

        var response = post("{\"query\":\"" + QUERY + "\"}", Map.of());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(form(UPSTREAM_BODIES.getFirst())).containsEntry("currentPage", "1");
        var body = JSON.readTree(response.body());
        assertThat(body.path("addresses").isArray()).isTrue();
        assertThat(body.path("addresses").isEmpty()).isTrue();
        assertThat(body.path("totalCount").asInt()).isZero();
    }

    @Test
    @DisplayName("확장 Origin의 요청은 다른 확장 호출 API처럼 별도 CORS 설정 없이 통과한다")
    void acceptsExtensionOrigin() throws Exception {
        stub = exchange -> respond(exchange, 200, success());

        var response = post("{\"query\":\"" + QUERY + "\"}", Map.of("Origin", "chrome-extension://synthetic-extension-id"));

        assertThat(response.statusCode()).isEqualTo(200);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "{\"query\":\"\"}",
        "{\"query\":\"   \"}",
        "{\"query\":null}",
        "{}",
        "{\"query\":\"SYNTHETIC-ADDR-QUERY-392\",\"page\":0}",
        "{\"query\":\"SYNTHETIC-ADDR-QUERY-392\",\"page\":101}",
        "{\"query\":\"SYNTHETIC-ADDR-QUERY-392\",\"page\":\"1\"}",
        "{\"query\":\"SYNTHETIC-ADDR-QUERY-392\",\"unknown\":1}",
        "{\"query\":\"SYNTHETIC-ADDR-QUERY-392",
        "SYNTHETIC-ADDR-QUERY-392"
    })
    @DisplayName("빈 검색어, 페이지 범위 위반과 깨진 본문은 값 노출 없이 400이고 외부 API를 부르지 않는다")
    void rejectsInvalidRequests(String body, CapturedOutput output) throws Exception {
        var response = post(body, Map.of());

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).isEqualTo("{\"error\":\"INVALID_INPUT\"}");
        assertThat(UPSTREAM_BODIES).isEmpty();
        assertNoPrivateValue(response, output);
    }

    @Test
    @DisplayName("검색어는 80자까지 받고 81자부터 400으로 거부한다")
    void enforcesQueryLengthBoundary(CapturedOutput output) throws Exception {
        stub = exchange -> respond(exchange, 200, success());
        var padded = QUERY + "가".repeat(80 - QUERY.length());

        assertThat(post("{\"query\":\"" + padded + "\"}", Map.of()).statusCode()).isEqualTo(200);
        UPSTREAM_BODIES.clear();
        var tooLong = post("{\"query\":\"" + padded + "가\"}", Map.of());

        assertThat(tooLong.statusCode()).isEqualTo(400);
        assertThat(tooLong.body()).isEqualTo("{\"error\":\"INVALID_INPUT\"}");
        assertThat(UPSTREAM_BODIES).isEmpty();
        assertNoPrivateValue(tooLong, output);
    }

    @Test
    @DisplayName("외부 API의 비정상 HTTP 상태는 메시지 없는 고정 502로 바뀐다")
    void mapsUpstreamStatusFailure(CapturedOutput output) throws Exception {
        stub = exchange -> respond(exchange, 500, UPSTREAM_MESSAGE + " " + QUERY);

        assertFixedFailure(search(), output);
        assertThat(output.getAll()).contains("ADDRESS_SEARCH_UPSTREAM_FAILED reason=HTTP_STATUS status=500");
    }

    @Test
    @DisplayName("errorCode가 0이 아니면 외부 메시지를 버리고 고정 502로 바뀐다")
    void mapsUpstreamErrorCode(CapturedOutput output) throws Exception {
        stub = exchange -> respond(exchange, 200, "{\"results\":{\"common\":{\"errorCode\":\"E0001\",\"errorMessage\":\""
            + UPSTREAM_MESSAGE + " " + QUERY + "\",\"totalCount\":\"0\",\"currentPage\":\"1\",\"countPerPage\":\"10\"},\"juso\":null}}");

        assertFixedFailure(search(), output);
        assertThat(output.getAll()).contains("ADDRESS_SEARCH_UPSTREAM_FAILED reason=ERROR_CODE code=E0001");
    }

    @Test
    @DisplayName("닫힌 형식이 아닌 errorCode는 로그에 그대로 남기지 않는다")
    void doesNotLogUnrecognizedErrorCode(CapturedOutput output) throws Exception {
        stub = exchange -> respond(exchange, 200, "{\"results\":{\"common\":{\"errorCode\":\"" + QUERY
            + "\",\"totalCount\":\"0\",\"currentPage\":\"1\",\"countPerPage\":\"10\"},\"juso\":null}}");

        assertFixedFailure(search(), output);
        assertThat(output.getAll()).contains("reason=ERROR_CODE code=UNRECOGNIZED");
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "SYNTHETIC-UPSTREAM-MESSAGE-392 not json",
        "{\"results\":{}}",
        "[]",
        "{\"results\":{\"common\":{\"errorCode\":\"0\",\"totalCount\":\"x\",\"currentPage\":\"1\",\"countPerPage\":\"10\"},\"juso\":[]}}",
        "{\"results\":{\"common\":{\"errorCode\":\"0\",\"totalCount\":\"1\",\"currentPage\":\"1\",\"countPerPage\":\"10\"},\"juso\":[{\"zipNo\":\"00000\"}]}}",
        "{\"results\":{\"common\":{\"errorCode\":\"0\",\"totalCount\":\"1\",\"currentPage\":\"1\",\"countPerPage\":\"10\"},\"juso\":null}}"
    })
    @DisplayName("깨진 JSON이나 약속과 다른 응답 구조는 고정 502로 바뀐다")
    void mapsMalformedResponse(String upstreamBody, CapturedOutput output) throws Exception {
        stub = exchange -> respond(exchange, 200, upstreamBody);

        assertFixedFailure(search(), output);
        assertThat(output.getAll()).contains("reason=INVALID_RESPONSE");
    }

    @Test
    @DisplayName("외부 API 시간 초과는 고정 502로 바뀌고 timeout 지표로 남는다")
    void mapsTimeout(CapturedOutput output) throws Exception {
        stub = exchange -> {
            try {
                NEVER_RELEASED_UNTIL_SHUTDOWN.await(30, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        };

        assertFixedFailure(search(), output);
        assertThat(output.getAll()).contains("reason=TIMEOUT", "provider=juso", "outcome=timeout");
    }

    @Test
    @DisplayName("재전송 응답은 따라가지 않고 고정 502로 바뀐다")
    void doesNotFollowRedirect(CapturedOutput output) throws Exception {
        stub = exchange -> {
            exchange.getResponseHeaders().set("Location", "http://127.0.0.1:" + UPSTREAM.getAddress().getPort() + "/addrlink/addrLinkApi.do");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        };

        assertFixedFailure(search(), output);
        assertThat(UPSTREAM_BODIES).hasSize(1);
    }

    @Test
    @DisplayName("검색어를 URL에 넣은 GET은 405이고 운영 로그 수준에서 URL의 검색어가 남지 않는다")
    void rejectsQueryInUrl(CapturedOutput output) throws Exception {
        // 프레임워크 DEBUG는 요청 URL 전체를 찍으므로 어떤 프로필도 켜지 않는 운영 수준으로 확인한다.
        var logging = LoggingSystem.get(getClass().getClassLoader());
        logging.setLogLevel("org.springframework.web", LogLevel.INFO);
        HttpResponse<String> response;
        try {
            response = HTTP.send(HttpRequest.newBuilder(
                    URI.create("http://127.0.0.1:" + port + "/api/v1/address/search?query=" + QUERY)).GET().build(),
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } finally {
            logging.setLogLevel("org.springframework.web", LogLevel.DEBUG);
        }

        assertThat(response.statusCode()).isEqualTo(405);
        assertThat(UPSTREAM_BODIES).isEmpty();
        assertNoPrivateValue(response, output);
    }

    private void assertFixedFailure(HttpResponse<String> response, CapturedOutput output) {
        assertThat(response.statusCode()).isEqualTo(502);
        assertThat(response.body()).isEqualTo(UNAVAILABLE);
        assertThat(output.getAll()).contains("ADDRESS_SEARCH_UPSTREAM_FAILED", "route=/api/v1/address/search", "status=502");
        assertNoPrivateValue(response, output);
    }
}
