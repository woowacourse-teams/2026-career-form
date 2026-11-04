package com.careerform.address;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.careerform.monitoring.ExternalCallMetrics;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 행정안전부 도로명주소 검색 API 호출. 승인키와 검색어는 URL이 아닌 폼 본문으로만 보내고,
 * 외부 응답 원문과 예외 메시지는 호출자와 로그로 넘기지 않는다.
 */
@Component
final class AddressSearchClient {
    static final int PAGE_SIZE = 10;
    private static final Logger log = LoggerFactory.getLogger(AddressSearchClient.class);
    private static final int MAX_RESPONSE_LENGTH = 1_000_000;
    private static final Pattern LOGGABLE_ERROR_CODE = Pattern.compile("E[0-9]{4}|-[0-9]{1,4}|[0-9]{1,4}");
    private static final Pattern COUNT = Pattern.compile("[0-9]{1,18}");
    private final String apiKey;
    private final String baseUrl;
    private final int timeoutMs;
    private final ExternalCallMetrics metrics;
    private final HttpClient http;
    private final JsonMapper mapper = JsonMapper.builder().build();

    AddressSearchClient(
        @Value("${career-form.address.juso.api-key:}") String apiKey,
        @Value("${career-form.address.juso.base-url:https://business.juso.go.kr/addrlink/addrLinkApi.do}") String baseUrl,
        @Value("${career-form.address.juso.timeout-ms:5000}") int timeoutMs,
        ObjectProvider<ExternalCallMetrics> metrics
    ) {
        if (timeoutMs < 1) { throw new IllegalStateException("Invalid address search timeout"); }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.timeoutMs = timeoutMs;
        this.metrics = metrics.getIfAvailable();
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(timeoutMs))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    }

    AddressSearchResponse search(String query, int page) {
        if (apiKey.isBlank()) { throw new NotConfigured(); }
        var startedAt = System.nanoTime();
        try {
            var result = parse(send(query, page), page);
            record(startedAt, false, false);
            return result;
        } catch (Unavailable unavailable) {
            record(startedAt, true, false);
            throw unavailable;
        } catch (RuntimeException exception) {
            var timeout = ExternalCallMetrics.isTimeout(exception);
            log.warn("ADDRESS_SEARCH_UPSTREAM_FAILED reason={}", timeout ? "TIMEOUT" : "CONNECTION");
            record(startedAt, true, timeout);
            throw new Unavailable();
        }
    }

    private String send(String query, int page) {
        var form = "confmKey=" + encode(apiKey) + "&currentPage=" + page + "&countPerPage=" + PAGE_SIZE
            + "&keyword=" + encode(query) + "&resultType=json";
        var request = HttpRequest.newBuilder(URI.create(baseUrl))
            .timeout(Duration.ofMillis(timeoutMs))
            .header("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
            .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8)).build();
        var pending = http.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        HttpResponse<String> response;
        try {
            response = pending.copy().orTimeout(timeoutMs, TimeUnit.MILLISECONDS).join();
        } finally {
            if (!pending.isDone()) { pending.cancel(true); }
        }
        if (response.statusCode() != 200) {
            log.warn("ADDRESS_SEARCH_UPSTREAM_FAILED reason=HTTP_STATUS status={}", response.statusCode());
            throw new Unavailable();
        }
        return response.body();
    }

    private AddressSearchResponse parse(String body, int page) {
        if (body.length() > MAX_RESPONSE_LENGTH) { throw invalidResponse(); }
        JsonNode results;
        try {
            results = mapper.readTree(body).path("results");
        } catch (JacksonException exception) {
            throw invalidResponse();
        }
        var common = results.path("common");
        var errorCode = common.path("errorCode");
        if (!errorCode.isString()) { throw invalidResponse(); }
        if (!"0".equals(errorCode.asString())) {
            log.warn("ADDRESS_SEARCH_UPSTREAM_FAILED reason=ERROR_CODE code={}",
                LOGGABLE_ERROR_CODE.matcher(errorCode.asString()).matches() ? errorCode.asString() : "UNRECOGNIZED");
            throw new Unavailable();
        }
        var totalCount = count(common.path("totalCount"));
        return new AddressSearchResponse(addresses(results.path("juso"), totalCount), page, PAGE_SIZE, totalCount);
    }

    private static long count(JsonNode node) {
        if (!node.isValueNode() || !COUNT.matcher(node.asString()).matches()) { throw invalidResponse(); }
        return Long.parseLong(node.asString());
    }

    private static List<AddressSearchResponse.Address> addresses(JsonNode juso, long totalCount) {
        if (juso.isMissingNode() || juso.isNull()) {
            if (totalCount != 0) { throw invalidResponse(); }
            return List.of();
        }
        if (!juso.isArray()) { throw invalidResponse(); }
        var addresses = new ArrayList<AddressSearchResponse.Address>();
        for (var item : juso) {
            addresses.add(new AddressSearchResponse.Address(required(item, "zipNo"), required(item, "roadAddr"),
                required(item, "jibunAddr"), required(item, "bdMgtSn")));
        }
        return addresses;
    }

    private static String required(JsonNode item, String field) {
        var value = item.path(field);
        if (!value.isString()) { throw invalidResponse(); }
        return value.asString();
    }

    private static Unavailable invalidResponse() {
        log.warn("ADDRESS_SEARCH_UPSTREAM_FAILED reason=INVALID_RESPONSE");
        return new Unavailable();
    }

    private void record(long startedAt, boolean failed, boolean timeout) {
        if (metrics != null) {
            metrics.record("juso", "address_search", System.nanoTime() - startedAt, failed, timeout);
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    static final class NotConfigured extends RuntimeException {
        NotConfigured() { super("Address search is not configured"); }
    }

    static final class Unavailable extends RuntimeException {
        Unavailable() { super("Address search is unavailable"); }
    }
}
