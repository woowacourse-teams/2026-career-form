package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.Cookie;

@DisplayName("공용 비밀번호 관리 API의 접근 경계")
@org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
class QualityManagementApiTest {
    private static final String HASH = "pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk=";
    private final Map<String, QualityAccess.Session> sessions = new HashMap<>();
    private final QualityAccess.SessionStore store = new QualityAccess.SessionStore() {
        public Optional<QualityAccess.Session> find(String id) { return Optional.ofNullable(sessions.get(id)); }
        public void save(QualityAccess.Session session) { sessions.put(session.id(), session); }
        public void delete(String id) { sessions.remove(id); }
    };
    private final QualityAccess access = new QualityAccess(Clock.fixed(Instant.parse("2030-01-01T00:00:00Z"), ZoneOffset.UTC), HASH,
        "618def57c8f930dd7dc165c96665f0caceffdbb24b8e114265d00ba2000a3957", store);

    @RestController
    static class Controller {
        @GetMapping("/api/v1/quality/sites") Map<String, String> sites() { return Map.of("status", "ok"); }
        @GetMapping("/api/v1/quality/stats") Map<String, String> stats() { return Map.of("status", "ok"); }
        @PostMapping("/api/v1/quality/sites/fixture/claim") Map<String, String> claim() { return Map.of("status", "ok"); }
    }

    @Test
    @DisplayName("HTTPS 로그인은 안전한 쿠키를 발급하고 세션 없이 목록을 볼 수 없다")
    void issuesSecureCookieAndProtectsLists() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new QualityLoginController(access), new Controller())
            .addFilters(new QualityApiFilter(access)).build();
        mvc.perform(get("/api/v1/quality/sites").secure(true)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/quality/login").contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"synthetic-only\"}"))
            .andExpect(status().isForbidden());
        var response = mvc.perform(post("/api/v1/quality/login").secure(true).contentType(MediaType.APPLICATION_JSON)
                .content("{\"password\":\"synthetic-only\"}"))
            .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getHeaders("Set-Cookie")).anySatisfy(header -> assertThat(header)
            .contains("Secure", "HttpOnly", "SameSite=Strict", "Path=/").doesNotContain("Path=/api/v1/quality"));
        assertThat(response.getContentAsString()).doesNotContain("synthetic-only", "sessionToken");
        assertThat(response.getHeaders("Set-Cookie")).anySatisfy(header -> assertThat(header)
            .startsWith("CF_QUALITY_CSRF=").contains("Secure", "SameSite=Strict", "Max-Age=28800").doesNotContain("HttpOnly"));
    }

    @Test
    @DisplayName("쓰기에는 CSRF가 필요하고 Grafana 토큰은 집계 읽기만 허용한다")
    void limitsCsrfAndReadonlyCredentials() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new Controller()).addFilters(new QualityApiFilter(access)).build();
        var login = access.login("synthetic-only", "fixture");
        var cookie = new Cookie("CF_QUALITY_SESSION", login.sessionToken());
        mvc.perform(post("/api/v1/quality/sites/fixture/claim").secure(true).cookie(cookie)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/quality/sites/fixture/claim").secure(true).cookie(cookie).header("X-Quality-CSRF", login.csrfToken()))
            .andExpect(status().isOk());
        mvc.perform(get("/api/v1/quality/stats").secure(true).header("Authorization", "Bearer synthetic-readonly"))
            .andExpect(status().isOk());
        mvc.perform(get("/api/v1/quality/sites").secure(true).header("Authorization", "Bearer synthetic-readonly"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("길이 없는 chunked 보고도 본문 제한을 적용한다")
    void capsActualBodyBytes() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new Controller()).addFilters(new QualityApiFilter(access)).build();
        mvc.perform(post("/api/v1/quality/executions/fixture/report").secure(true).contentType(MediaType.APPLICATION_JSON)
            .content(new byte[128 * 1024 + 1])).andExpect(status().isPayloadTooLarge());
    }

    @Test
    void protectsManagementScreenAndUnconfiguredLogin() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new Controller()).addFilters(new QualityApiFilter(access)).build();
        mvc.perform(get("/quality/").secure(true)).andExpect(status().isFound());
        var disabled = new QualityAccess(Clock.systemUTC(), "", "", store);
        var unavailable = MockMvcBuilders.standaloneSetup(new Controller()).addFilters(new QualityApiFilter(disabled)).build();
        unavailable.perform(get("/quality/login.html").secure(true)).andExpect(status().isServiceUnavailable());
    }

    @Test
    void neverLogsRejectedPasswordBodies(org.springframework.boot.test.system.CapturedOutput output) throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new QualityLoginController(access)).setControllerAdvice(new QualityInputErrors())
            .addFilters(new QualityApiFilter(access)).build();
        mvc.perform(post("/api/v1/quality/login").secure(true).contentType(MediaType.APPLICATION_JSON)
            .content("{\"password\":\"synthetic-sensitive-login" + "x".repeat(1050) + "\"}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/quality/login").secure(true).contentType(MediaType.APPLICATION_JSON)
            .content("{\"password\":[\"synthetic-sensitive-login\"]}"))
            .andExpect(status().isBadRequest());
        assertThat(output.getAll()).doesNotContain("synthetic-sensitive-login");
    }
}
