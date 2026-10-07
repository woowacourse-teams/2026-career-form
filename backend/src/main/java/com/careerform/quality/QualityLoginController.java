package com.careerform.quality;

import java.time.Duration;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityLoginController {
    private final QualityAccess access;

    public QualityLoginController(QualityAccess access) { this.access = access; }

    public record Credentials(String password) {
        @Override public String toString() { return "Credentials[redacted]"; }
    }

    @PostMapping("/api/v1/quality/login")
    public ResponseEntity<Map<String, String>> login(@RequestBody Credentials credentials, HttpServletRequest request) {
        var login = access.login(credentials.password(), request.getRemoteAddr());
        return switch (login.status()) {
            case OK -> ResponseEntity.ok().header("Set-Cookie", cookie(login.sessionToken(), Duration.ofHours(8)),
                claimCookie(access.claimant(QualityApiFilter.claimant(request))), csrfCookie(login.csrfToken(), Duration.ofHours(8)))
                .body(Map.of("csrf", login.csrfToken()));
            case NOT_CONFIGURED -> ResponseEntity.status(503).body(Map.of("error", "NOT_CONFIGURED"));
            case THROTTLED -> ResponseEntity.status(429).body(Map.of("error", "THROTTLED"));
            case INVALID -> ResponseEntity.status(401).body(Map.of("error", "INVALID"));
        };
    }

    @PostMapping("/api/v1/quality/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        access.logout(QualityApiFilter.session(request));
        return ResponseEntity.noContent().header("Set-Cookie", cookie("", Duration.ZERO), csrfCookie("", Duration.ZERO)).build();
    }

    private String cookie(String token, Duration age) {
        return ResponseCookie.from("CF_QUALITY_SESSION", token).secure(true).httpOnly(true).sameSite("Strict")
            .path("/").maxAge(age).build().toString();
    }

    static String claimCookie(String token) {
        return ResponseCookie.from("CF_QUALITY_CLAIM", token).secure(true).httpOnly(true).sameSite("Strict")
            .path("/").maxAge(Duration.ofHours(24)).build().toString();
    }

    private String csrfCookie(String token, Duration age) {
        return ResponseCookie.from("CF_QUALITY_CSRF", token).secure(true).sameSite("Strict")
            .path("/").maxAge(age).build().toString();
    }
}
