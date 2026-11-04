package com.careerform.address;

import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

/** 확장용 API. 검색어는 개인정보이므로 URL에 실리지 않게 POST 본문으로만 받는다. */
@RestController
public final class AddressSearchController {
    private static final int MAX_QUERY_LENGTH = 80;
    private static final int MAX_PAGE = 100;
    private final AddressSearchClient client;
    private final AddressRateLimiter limiter;

    AddressSearchController(AddressSearchClient client, AddressRateLimiter limiter) {
        this.client = client;
        this.limiter = limiter;
    }

    public record SearchRequest(String query, Integer page) {
        @Override public String toString() { return "SearchRequest[redacted]"; }
    }

    @PostMapping("/api/v1/address/search")
    public ResponseEntity<?> search(@RequestBody SearchRequest body, HttpServletRequest request) {
        var query = body.query() == null ? "" : body.query().strip();
        var page = body.page() == null ? 1 : body.page();
        if (query.isEmpty() || query.length() > MAX_QUERY_LENGTH || page < 1 || page > MAX_PAGE) {
            return invalidInput();
        }
        if (!limiter.tryAcquire(request.getRemoteAddr())) {
            return ResponseEntity.status(429).header(HttpHeaders.RETRY_AFTER, String.valueOf(limiter.retryAfterSeconds()))
                .body(Map.of("error", "RATE_LIMITED"));
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(client.search(query, page));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> invalidInput() {
        return ResponseEntity.badRequest().body(Map.of("error", "INVALID_INPUT"));
    }

    @ExceptionHandler(AddressSearchClient.NotConfigured.class)
    public ResponseEntity<Map<String, String>> notConfigured() {
        return ResponseEntity.status(503).body(Map.of("error", "ADDRESS_SEARCH_NOT_CONFIGURED"));
    }

    @ExceptionHandler(AddressSearchClient.Unavailable.class)
    public ResponseEntity<Map<String, String>> unavailable() {
        return ResponseEntity.status(502).body(Map.of("error", "ADDRESS_SEARCH_UNAVAILABLE"));
    }
}
