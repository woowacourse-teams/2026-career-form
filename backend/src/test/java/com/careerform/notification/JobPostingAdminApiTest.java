package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.quality.QualityAccess;
import com.careerform.quality.QualityApiFilter;

import tools.jackson.databind.json.JsonMapper;

@DisplayName("공고 관리 API와 품질 로그인 경계")
class JobPostingAdminApiTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final String HASH = "pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk=";
    private static final String PASSWORD = "Basic " + Base64.getEncoder().encodeToString("quality:synthetic-only".getBytes(StandardCharsets.UTF_8));
    private final Map<String, QualityAccess.Session> sessions = new HashMap<>();
    private final QualityAccess.SessionStore sessionStore = new QualityAccess.SessionStore() {
        public Optional<QualityAccess.Session> find(String id) { return Optional.ofNullable(sessions.get(id)); }
        public void save(QualityAccess.Session session) { sessions.put(session.id(), session); }
        public void delete(String id) { sessions.remove(id); }
    };
    private final QualityAccess access = new QualityAccess(Clock.fixed(NOW, ZoneOffset.UTC), HASH, "", sessionStore);
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final JobPostingService postings = new JobPostingService(store, Clock.fixed(NOW, ZoneOffset.UTC));
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new JobPostingAdminController(postings), new Fixture())
        .setControllerAdvice(new NotificationInputErrors()).addFilters(new QualityApiFilter(access)).build();

    @RestController
    static class Fixture {
        @GetMapping("/api/v1/notifications/postings") Map<String, String> open() { return Map.of("status", "ok"); }
        @GetMapping("/notifications/") String page() { return "login shell"; }
    }

    @Test
    @DisplayName("관리 API는 비밀번호 없이 응답하지 않고 확장용 목록은 비밀번호 없이 열린다")
    void requiresQualityPasswordForAdminOnly() throws Exception {
        mvc.perform(get("/api/v1/notifications/admin/postings")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/notifications/admin/postings").contentType(MediaType.APPLICATION_JSON).content(registration("https://careers.example.test/jobs/1")))
            .andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/v1/notifications/admin/postings/0123456789abcdef0123456789abcdef")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD).header("Origin", "https://evil.example.test"))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD)).andExpect(status().isOk())
            .andExpect(jsonPath("$.postings").isArray());
        mvc.perform(get("/api/v1/notifications/postings")).andExpect(status().isOk());
        mvc.perform(get("/notifications/")).andExpect(status().isOk());
        assertThat(store.listPostings()).isEmpty();
    }

    @Test
    @DisplayName("품질 로그인이 없거나 설정되지 않은 환경에서는 관리 API와 화면이 열리지 않는다")
    void failsClosedWithoutQualityAccess() throws Exception {
        var unconfigured = new QualityAccess(Clock.systemUTC(), "", "", sessionStore);
        var unavailable = MockMvcBuilders.standaloneSetup(new JobPostingAdminController(postings), new Fixture())
            .addFilters(new QualityApiFilter(unconfigured)).build();
        unavailable.perform(get("/notifications/")).andExpect(status().isServiceUnavailable());
        unavailable.perform(get("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD)).andExpect(status().isServiceUnavailable());
        var disabled = MockMvcBuilders.standaloneSetup(new JobPostingAdminController(postings), new Fixture())
            .addFilters(new QualityApiFilter((QualityAccess) null)).build();
        disabled.perform(get("/notifications/")).andExpect(status().isNotFound());
        disabled.perform(get("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD)).andExpect(status().isNotFound());
        disabled.perform(get("/api/v1/notifications/postings")).andExpect(status().isOk());
    }

    @Test
    @DisplayName("등록은 저장과 예약 확인을 즉시 돌려주고 같은 링크는 기존 공고 ID와 함께 409다")
    void registersAndRejectsDuplicateLink() throws Exception {
        store.insertSubscription(new PushSubscription("s1", "https://fcm.googleapis.com/fcm/send/s1", "p", "a", NOW));
        store.insertSubscription(new PushSubscription("s2", "https://fcm.googleapis.com/fcm/send/s2", "p", "a", NOW));
        var created = mvc.perform(post("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD).contentType(MediaType.APPLICATION_JSON)
                .content(registration("https://careers.example.test/jobs/1")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").isString())
            .andExpect(jsonPath("$.scheduledAt").value("2030-01-01T06:00:00Z"))
            .andExpect(jsonPath("$.deliveries").value(2))
            .andReturn().getResponse().getContentAsString();
        var id = JsonMapper.builder().build().readTree(created).path("id").asString();
        mvc.perform(post("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD).contentType(MediaType.APPLICATION_JSON)
                .content(registration("https://careers.example.test/jobs/1")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("DUPLICATE_LINK"))
            .andExpect(jsonPath("$.postingId").value(id));
        assertThat(store.deliveries()).hasSize(2).allMatch(delivery -> delivery.status() == PushDelivery.Status.PENDING);
    }

    @Test
    @DisplayName("잘못된 입력은 이유 코드와 함께 400이다")
    void rejectsInvalidRegistrations() throws Exception {
        mvc.perform(post("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD).contentType(MediaType.APPLICATION_JSON)
                .content("{\"company\":\"합성 회사\",\"role\":\"백엔드\",\"link\":\"ftp://careers.example.test/jobs/1\",\"opensAt\":\"2030-01-01T06:00:00Z\",\"closesAt\":\"2030-01-31T15:00:00Z\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("INVALID_POSTING"))
            .andExpect(jsonPath("$.reason").value("LINK"));
        mvc.perform(post("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD).contentType(MediaType.APPLICATION_JSON)
                .content("{\"company\":\"합성 회사\",\"role\":\"백엔드\",\"link\":\"https://careers.example.test/jobs/1\",\"opensAt\":\"2030-01-31T15:00:00Z\",\"closesAt\":\"2030-01-01T06:00:00Z\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.reason").value("PERIOD"));
        mvc.perform(post("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD).contentType(MediaType.APPLICATION_JSON)
                .content("{\"company\":"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("INVALID_INPUT"));
        mvc.perform(post("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD).contentType(MediaType.APPLICATION_JSON)
                .content("{\"company\":\"합성 회사\",\"role\":\"백엔드\",\"link\":\"https://careers.example.test/jobs/1\",\"opensAt\":\"not-a-time\",\"closesAt\":\"2030-01-31T15:00:00Z\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("INVALID_INPUT"));
        assertThat(store.listPostings()).isEmpty();
    }

    @Test
    @DisplayName("목록은 최근 등록 순으로 발송 진행과 예정 시각을 주고 삭제는 대기 발송만 취소한다")
    void listsProgressAndDeletesPendingOnly() throws Exception {
        store.insertSubscription(new PushSubscription("s1", "https://fcm.googleapis.com/fcm/send/s1", "p", "a", NOW));
        store.insertSubscription(new PushSubscription("s2", "https://fcm.googleapis.com/fcm/send/s2", "p", "a", NOW));
        var registered = (JobPostingService.Registered) postings.register(new JobPostingService.Draft("합성 회사", "백엔드",
            "https://careers.example.test/jobs/2", NOW.minusSeconds(60), NOW.plusSeconds(86400)));
        var claimed = store.claimDelivery(store.findDueDeliveries(NOW, 1).getFirst(), NOW, NOW.plusSeconds(120)).orElseThrow();
        store.completeDelivery(claimed, claimed.accepted(201));

        mvc.perform(get("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.postings.length()").value(1))
            .andExpect(jsonPath("$.postings[0].id").value(registered.posting().id()))
            .andExpect(jsonPath("$.postings[0].company").value("합성 회사"))
            .andExpect(jsonPath("$.postings[0].link").value("https://careers.example.test/jobs/2"))
            .andExpect(jsonPath("$.postings[0].registeredAt").value("2030-01-01T00:00:00Z"))
            .andExpect(jsonPath("$.postings[0].scheduledAt").value("2030-01-01T00:00:00Z"))
            .andExpect(jsonPath("$.postings[0].progress.pending").value(1))
            .andExpect(jsonPath("$.postings[0].progress.accepted").value(1))
            .andExpect(jsonPath("$.postings[0].progress.abandoned").value(0))
            .andExpect(jsonPath("$.postings[0].progress.lastAttemptAt").value("2030-01-01T00:00:00Z"));

        mvc.perform(delete("/api/v1/notifications/admin/postings/" + registered.posting().id()).header("Authorization", PASSWORD))
            .andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/notifications/admin/postings/" + registered.posting().id()).header("Authorization", PASSWORD))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("POSTING_NOT_FOUND"));
        mvc.perform(delete("/api/v1/notifications/admin/postings/not-an-id").header("Authorization", PASSWORD)).andExpect(status().isNotFound());
        assertThat(store.listPostings()).isEmpty();
        assertThat(store.deliveries()).singleElement().satisfies(delivery -> assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ACCEPTED));
        mvc.perform(get("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD)).andExpect(jsonPath("$.postings.length()").value(0));
    }

    @Test
    @DisplayName("직무를 생략하거나 비워도 등록되고 목록은 직무 필드를 생략한다")
    void registersWithoutRole() throws Exception {
        store.insertSubscription(new PushSubscription("s1", "https://fcm.googleapis.com/fcm/send/s1", "p", "a", NOW));
        mvc.perform(post("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD).contentType(MediaType.APPLICATION_JSON)
                .content("{\"company\":\"합성 회사\",\"link\":\"https://careers.example.test/jobs/omitted\",\"opensAt\":\"2030-01-01T06:00:00Z\",\"closesAt\":\"2030-01-31T15:00:00Z\"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.deliveries").value(1));
        mvc.perform(post("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD).contentType(MediaType.APPLICATION_JSON)
                .content("{\"company\":\"합성 회사\",\"role\":\"\",\"link\":\"https://careers.example.test/jobs/blank\",\"opensAt\":\"2030-01-01T06:00:00Z\",\"closesAt\":\"2030-01-31T15:00:00Z\"}"))
            .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD).contentType(MediaType.APPLICATION_JSON)
                .content("{\"company\":\"합성 회사\",\"role\":\"" + "직".repeat(121) + "\",\"link\":\"https://careers.example.test/jobs/long\",\"opensAt\":\"2030-01-01T06:00:00Z\",\"closesAt\":\"2030-01-31T15:00:00Z\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.reason").value("ROLE"));
        mvc.perform(get("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.postings.length()").value(2))
            .andExpect(jsonPath("$.postings[0].role").doesNotExist())
            .andExpect(jsonPath("$.postings[1].role").doesNotExist())
            .andExpect(jsonPath("$.postings[0].company").value("합성 회사"));
        assertThat(store.deliveries()).hasSize(2);
    }

    private static String registration(String link) {
        return "{\"company\":\"합성 회사\",\"role\":\"백엔드\",\"link\":\"" + link + "\",\"opensAt\":\"2030-01-01T06:00:00Z\",\"closesAt\":\"2030-01-31T15:00:00Z\"}";
    }
}
