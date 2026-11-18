package com.careerform.profileimport;

import java.time.Duration;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.address.AddressRateLimiter;

import jakarta.servlet.http.HttpServletRequest;

/** 확장용 API. 이력서 글자는 개인정보이므로 POST 본문으로만 받고, 요청·응답 객체의 문자열 표현에 값을 싣지 않는다. */
@RestController
public final class ProfileImportController {
    static final int SCHEMA_VERSION = 1;
    private final ProfileImportService service;
    private final AddressRateLimiter limiter;

    @Autowired
    ProfileImportController(
        ProfileImportService service,
        @Value("${career-form.profile-import.rate-limit.max-requests:10}") int maxRequests,
        @Value("${career-form.profile-import.rate-limit.window:60s}") Duration window,
        @Value("${career-form.profile-import.rate-limit.max-clients:10000}") int maxClients
    ) {
        this(service, new AddressRateLimiter(maxRequests, window, maxClients));
    }

    ProfileImportController(ProfileImportService service, AddressRateLimiter limiter) {
        this.service = service;
        this.limiter = limiter;
    }

    public record ResumeRequest(String text) {
        @Override public String toString() { return "ResumeRequest[redacted]"; }
    }

    public record DraftResponse(int schemaVersion, Map<String, Object> profile) {
        @Override public String toString() { return "DraftResponse[redacted]"; }
    }

    @PostMapping("/api/v1/profile-import/resume")
    public ResponseEntity<?> importResume(@RequestBody(required = false) ResumeRequest body, HttpServletRequest request) {
        var text = body == null ? null : body.text();
        if (!limiter.tryAcquire(request.getRemoteAddr())) {
            service.rejected(ProfileImportService.Result.RATE_LIMITED, ProfileImportService.inputChars(text));
            return ResponseEntity.status(429).cacheControl(CacheControl.noStore())
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(limiter.retryAfterSeconds()))
                .body(Map.of("error", "RATE_LIMITED"));
        }
        var outcome = service.importResume(text);
        return switch (outcome.result()) {
            case OK -> ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new DraftResponse(SCHEMA_VERSION, outcome.profile()));
            case EMPTY_INPUT -> error(400, Map.of("error", "RESUME_TEXT_EMPTY"));
            case TOO_LONG -> error(413, Map.of("error", "RESUME_TEXT_TOO_LONG", "maxLength", service.maxChars()));
            case NOT_CONFIGURED -> error(503, Map.of("error", "PROFILE_IMPORT_NOT_CONFIGURED"));
            case LLM_FAILED -> error(502, Map.of("error", "PROFILE_IMPORT_UNAVAILABLE"));
            case INVALID_INPUT, RATE_LIMITED -> throw new IllegalStateException("Unexpected profile import result");
        };
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> invalidInput() {
        service.rejected(ProfileImportService.Result.INVALID_INPUT, 0);
        return error(400, Map.of("error", "INVALID_INPUT"));
    }

    private static ResponseEntity<Map<String, Object>> error(int status, Map<String, Object> body) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(body);
    }
}
