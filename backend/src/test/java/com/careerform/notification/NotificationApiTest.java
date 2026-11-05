package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

@DisplayName("확장용 알림 API")
@ExtendWith(OutputCaptureExtension.class)
class NotificationApiTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/synthetic-token-for-api-test";
    private final VapidTestKeys keys = VapidTestKeys.generate();
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private final JobPostingService postings = new JobPostingService(store, JobCategories.load(), RoleFilterPolicy.defaults(), clock);
    private final PushSubscriptionService subscriptions = new PushSubscriptionService(store, JobCategories.load(), clock, Set.of("fcm.googleapis.com"));
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new NotificationController(
            VapidKeys.parse(keys.publicKey, keys.privateKey, "mailto:synthetic@example.test"), subscriptions, postings, JobCategories.load()))
        .setControllerAdvice(new NotificationInputErrors()).build();

    @Test
    @DisplayName("확장이 구독을 만들 때 쓸 VAPID 공개키를 돌려준다")
    void servesVapidPublicKey() throws Exception {
        mvc.perform(get("/api/v1/notifications/vapid-public-key"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.publicKey").value(keys.publicKey));
    }

    @Test
    @DisplayName("같은 endpoint의 구독 등록은 두 번 보내도 하나이고 해지는 204로 끝난다")
    void registersSubscriptionOnceAndUnsubscribes(CapturedOutput output) throws Exception {
        var p256dh = VapidTestKeys.generate().publicKey;
        var auth = randomAuth();
        var body = subscriptionJson(ENDPOINT, p256dh, auth);
        var first = mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.created").value(true)).andReturn().getResponse().getContentAsString();
        var second = mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(false)).andReturn().getResponse().getContentAsString();
        var mapper = JsonMapper.builder().build();
        assertThat(mapper.readTree(first).path("subscriptionId").asString()).matches("[0-9a-f]{32}")
            .isEqualTo(mapper.readTree(second).path("subscriptionId").asString());
        assertThat(store.subscriptionIds()).hasSize(1);
        assertThat(first).doesNotContain(ENDPOINT, p256dh, auth);
        assertThat(output.getAll()).doesNotContain("synthetic-token-for-api-test", p256dh, auth);

        mvc.perform(post("/api/v1/notifications/subscriptions/unsubscribe").contentType(MediaType.APPLICATION_JSON)
            .content("{\"endpoint\":\"" + ENDPOINT + "\"}")).andExpect(status().isNoContent());
        assertThat(store.subscriptionIds()).isEmpty();
        mvc.perform(post("/api/v1/notifications/subscriptions/unsubscribe").contentType(MediaType.APPLICATION_JSON)
            .content("{\"endpoint\":\"" + ENDPOINT + "\"}")).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("허용되지 않은 endpoint나 잘못된 키, 읽을 수 없는 본문은 400이다")
    void rejectsInvalidSubscriptionInput() throws Exception {
        mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON)
                .content(subscriptionJson("https://push.example.test/send/x", VapidTestKeys.generate().publicKey, randomAuth())))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("INVALID_SUBSCRIPTION"));
        mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON)
                .content(subscriptionJson(ENDPOINT, "short", randomAuth())))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("INVALID_SUBSCRIPTION"));
        mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON).content("{\"endpoint\":"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("INVALID_INPUT"));
        mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON).content("{\"endpoint\":\"" + ENDPOINT + "\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("INVALID_SUBSCRIPTION"));
        mvc.perform(post("/api/v1/notifications/subscriptions/unsubscribe").contentType(MediaType.APPLICATION_JSON).content("{\"endpoint\":\"ftp://x\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("INVALID_SUBSCRIPTION"));
        assertThat(store.subscriptionIds()).isEmpty();
    }

    @Test
    @DisplayName("구독 등록의 roles는 저장되고, 재등록에 roles가 있으면 덮어쓰고 없거나 null이면 유지하며 빈 배열은 미선택이고, 모르는 코드는 400 INVALID_SUBSCRIPTION이다")
    void storesAndUpdatesSubscriptionRoles(CapturedOutput output) throws Exception {
        var p256dh = VapidTestKeys.generate().publicKey;
        var auth = randomAuth();
        mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON)
                .content(subscriptionJson(ENDPOINT, p256dh, auth, "[\"IT.BACKEND\",\"IT.NOPE\"]")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("INVALID_SUBSCRIPTION"));
        assertThat(store.subscriptionIds()).isEmpty();

        var created = mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON)
                .content(subscriptionJson(ENDPOINT, p256dh, auth, "[\"IT.BACKEND\",\"IT.DATA\"]")))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.created").value(true)).andExpect(jsonPath("$.subscriptionId").isString())
            .andExpect(jsonPath("$.roles").doesNotExist()).andReturn().getResponse().getContentAsString();
        var id = JsonMapper.builder().build().readTree(created).path("subscriptionId").asString();
        var subscription = store.findSubscriptionByEndpoint(ENDPOINT).orElseThrow();
        assertThat(subscription.id()).isEqualTo(id);
        assertThat(subscription.roles()).containsExactly("IT.BACKEND", "IT.DATA");
        assertThat(subscription.rolesUpdatedAt()).isEqualTo(NOW);

        mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON).content(subscriptionJson(ENDPOINT, p256dh, auth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(false)).andExpect(jsonPath("$.subscriptionId").value(id));
        assertThat(store.findSubscription(id).orElseThrow().roles()).as("roles 필드가 없으면 유지").containsExactly("IT.BACKEND", "IT.DATA");
        mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON)
                .content(subscriptionJson(ENDPOINT, p256dh, auth, "null")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(false));
        assertThat(store.findSubscription(id).orElseThrow().roles()).as("roles가 null이어도 유지").containsExactly("IT.BACKEND", "IT.DATA");

        mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON)
                .content(subscriptionJson(ENDPOINT, p256dh, auth, "[\"DESIGN.UX_UI\"]")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(false)).andExpect(jsonPath("$.subscriptionId").value(id));
        assertThat(store.findSubscription(id).orElseThrow().roles()).as("roles가 있으면 덮어쓴다").containsExactly("DESIGN.UX_UI");

        mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON).content(subscriptionJson(ENDPOINT, p256dh, auth, "[]")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(false));
        assertThat(store.findSubscription(id).orElseThrow().roles()).as("빈 배열은 미선택").isNull();

        mvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON).content(subscriptionJson(ENDPOINT, p256dh, auth, "[\"IT.NOPE\"]")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("INVALID_SUBSCRIPTION"));
        assertThat(store.subscriptionIds()).containsExactly(id);
        assertThat(output.getAll()).doesNotContain("synthetic-token-for-api-test", p256dh, auth, "IT.BACKEND", "DESIGN.UX_UI");
    }

    @Test
    @DisplayName("진행 중 공고 목록은 접수 시작 이후 마감 전인 공고만 마감순으로 주고 직무 코드 배열을 싣되 레거시 공고는 생략하며 등록 시각은 숨긴다")
    void listsOpenPostingsForExtension() throws Exception {
        postings.register(new JobPostingService.Draft("합성 회사 A", List.of("IT.BACKEND"), "https://careers.example.test/jobs/a", NOW.minusSeconds(60), NOW.plusSeconds(7200)));
        postings.register(new JobPostingService.Draft("합성 회사 B", List.of("IT.FRONTEND", "IT.MOBILE"), "https://careers.example.test/jobs/b", NOW, NOW.plusSeconds(3600)));
        postings.register(new JobPostingService.Draft("합성 회사 C", List.of("IT.DATA"), "https://careers.example.test/jobs/c", NOW.plusSeconds(1), NOW.plusSeconds(3600)));
        store.insertPosting(new JobPosting("0123456789abcdef0123456789abcdef", "합성 회사 D", null, null, "https://careers.example.test/jobs/d",
            NOW.minusSeconds(60), NOW.plusSeconds(1800), NOW.minusSeconds(60)));
        mvc.perform(get("/api/v1/notifications/postings"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.postings.length()").value(3))
            .andExpect(jsonPath("$.postings[0].company").value("합성 회사 D"))
            .andExpect(jsonPath("$.postings[0].role").doesNotExist())
            .andExpect(jsonPath("$.postings[0].roles").doesNotExist())
            .andExpect(jsonPath("$.postings[0].link").value("https://careers.example.test/jobs/d"))
            .andExpect(jsonPath("$.postings[1].company").value("합성 회사 B"))
            .andExpect(jsonPath("$.postings[1].role").value("프론트엔드·모바일"))
            .andExpect(jsonPath("$.postings[1].roles.length()").value(2))
            .andExpect(jsonPath("$.postings[1].roles[0]").value("IT.FRONTEND"))
            .andExpect(jsonPath("$.postings[1].roles[1]").value("IT.MOBILE"))
            .andExpect(jsonPath("$.postings[1].link").value("https://careers.example.test/jobs/b"))
            .andExpect(jsonPath("$.postings[1].opensAt").value("2030-01-01T00:00:00Z"))
            .andExpect(jsonPath("$.postings[1].closesAt").value("2030-01-01T01:00:00Z"))
            .andExpect(jsonPath("$.postings[1].id").isString())
            .andExpect(jsonPath("$.postings[1].registeredAt").doesNotExist())
            .andExpect(jsonPath("$.postings[2].company").value("합성 회사 A"))
            .andExpect(jsonPath("$.postings[2].roles[0]").value("IT.BACKEND"));
    }

    @Test
    @DisplayName("roles 없이 자유 글자 role만 있는 레거시 공고는 진행 중 목록 항목에 role을 그대로 싣고 roles만 생략한다")
    void keepsLegacyFreeTextRoleInOpenPostings() throws Exception {
        store.insertPosting(new JobPosting("0123456789abcdef0123456789abcdef", "합성 회사 E", "합성 직무", null, "https://careers.example.test/jobs/e",
            NOW.minusSeconds(60), NOW.plusSeconds(1800), NOW.minusSeconds(60)));
        mvc.perform(get("/api/v1/notifications/postings"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.postings.length()").value(1))
            .andExpect(jsonPath("$.postings[0].company").value("합성 회사 E"))
            .andExpect(jsonPath("$.postings[0].role").value("합성 직무"))
            .andExpect(jsonPath("$.postings[0].roles").doesNotExist())
            .andExpect(jsonPath("$.postings[0].link").value("https://careers.example.test/jobs/e"));
    }

    @Test
    @DisplayName("직무 분류는 버전과 대분류·소분류의 코드·라벨을 돌려준다")
    void servesJobCategories() throws Exception {
        mvc.perform(get("/api/v1/notifications/job-categories"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version").value(1))
            .andExpect(jsonPath("$.categories.length()").value(7))
            .andExpect(jsonPath("$.categories[0].code").value("IT"))
            .andExpect(jsonPath("$.categories[0].label").value("IT/개발"))
            .andExpect(jsonPath("$.categories[0].roles[0].code").value("IT.BACKEND"))
            .andExpect(jsonPath("$.categories[0].roles[0].label").value("백엔드"));
    }

    static String subscriptionJson(String endpoint, String p256dh, String auth) {
        return "{\"endpoint\":\"" + endpoint + "\",\"expirationTime\":null,\"keys\":{\"p256dh\":\"" + p256dh + "\",\"auth\":\"" + auth + "\"}}";
    }

    /** rolesJson은 JSON 배열 글자 그대로("[]", "null", "[\"IT.BACKEND\"]")다. */
    static String subscriptionJson(String endpoint, String p256dh, String auth, String rolesJson) {
        return "{\"endpoint\":\"" + endpoint + "\",\"expirationTime\":null,\"keys\":{\"p256dh\":\"" + p256dh + "\",\"auth\":\"" + auth + "\"},"
            + "\"roles\":" + rolesJson + "}";
    }

    static String randomAuth() {
        var bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        return VapidTestKeys.base64Url(bytes);
    }
}
