package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test?serverSelectionTimeoutMS=200",
    "career-form.llm.enabled=false",
    "management.health.mongodb.enabled=false",
    "career-form.notification.enabled=true",
    "career-form.notification.push.dispatch-interval=10s",
    "career-form.quality.enabled=true",
    "career-form.quality.password-hash=pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk="
})
@AutoConfigureMockMvc
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@Import(NotificationEnabledContextTest.Fakes.class)
@DisplayName("알림 기능 토글이 켜진 애플리케이션 컨텍스트")
class NotificationEnabledContextTest {
    private static final VapidTestKeys KEYS = VapidTestKeys.generate();
    private static final String PASSWORD = "Basic " + Base64.getEncoder().encodeToString("quality:synthetic-only".getBytes(StandardCharsets.UTF_8));

    @TestConfiguration(proxyBeanMethods = false)
    static class Fakes {
        @Bean @Primary NotificationStore memoryNotificationStore() { return new MemoryNotificationStore(); }
        @Bean @Primary WebPushClient fakeWebPushClient() { return new FakeWebPushClient(); }
    }

    @DynamicPropertySource
    static void vapid(DynamicPropertyRegistry registry) {
        registry.add("career-form.notification.push.vapid.public-key", () -> KEYS.publicKey);
        registry.add("career-form.notification.push.vapid.private-key", () -> KEYS.privateKey);
        registry.add("career-form.notification.push.vapid.subject", () -> "mailto:synthetic@example.test");
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ApplicationContext context;
    @MockitoBean private FormAnalysisCompanyMongoRepository companies;

    @Test
    @DisplayName("설정한 공개키를 내려주고 브라우저 구독 JSON의 expirationTime을 엄격 모드에서도 받는다")
    void servesKeyAndAcceptsBrowserSubscriptionJson() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/vapid-public-key")).andExpect(status().isOk()).andExpect(jsonPath("$.publicKey").value(KEYS.publicKey));
        var auth = new byte[16];
        new SecureRandom().nextBytes(auth);
        mockMvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON)
                .content(NotificationApiTest.subscriptionJson("https://fcm.googleapis.com/fcm/send/synthetic-context", VapidTestKeys.generate().publicKey, VapidTestKeys.base64Url(auth))))
            .andExpect(status().isCreated());
        mockMvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON)
                .content(NotificationApiTest.subscriptionJson("https://jmt17.google.com/fcm/send/synthetic-context-2", VapidTestKeys.generate().publicKey, VapidTestKeys.base64Url(auth))))
            .andExpect(status().isCreated());
        mockMvc.perform(get("/api/v1/notifications/postings")).andExpect(status().isOk()).andExpect(jsonPath("$.postings").isEmpty());
    }

    @Test
    @DisplayName("관리 API와 화면은 품질 로그인 뒤에 있고 /notifications는 정적 관리 화면으로 전달된다")
    void protectsAdminApiAndServesManagementPage() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/admin/postings")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/notifications/admin/postings").header("Authorization", PASSWORD)).andExpect(status().isOk())
            .andExpect(jsonPath("$.postings").isEmpty());
        mockMvc.perform(get("/notifications/")).andExpect(status().isOk()).andExpect(forwardedUrl("/notifications/index.html"));
        mockMvc.perform(get("/notifications")).andExpect(status().isOk()).andExpect(forwardedUrl("/notifications/index.html"));
        mockMvc.perform(get("/notifications/index.html")).andExpect(status().isOk())
            .andExpect(result -> assertThat(new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8)).contains("공고 알림 관리"));
        mockMvc.perform(get("/notifications/postings.js")).andExpect(status().isOk())
            .andExpect(result -> assertThat(new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8)).contains("/api/v1/notifications/admin", "/summary?from="));
    }

    @Test
    @DisplayName("발송기가 설정한 주기의 fixedDelay 작업으로 등록되고 가짜 클라이언트와 메모리 저장소가 주입된다")
    void schedulesDispatcherWithConfiguredInterval() {
        assertThat(context.getBean(WebPushClient.class)).isInstanceOf(FakeWebPushClient.class);
        assertThat(context.getBean(NotificationStore.class)).isInstanceOf(MemoryNotificationStore.class);
        assertThat(context.getBean(PushSettings.class).dispatchInterval()).isEqualTo(Duration.ofSeconds(10));
        var tasks = context.getBean(ScheduledAnnotationBeanPostProcessor.class).getScheduledTasks().stream()
            .filter(task -> String.valueOf(task.getTask().getRunnable()).endsWith(PushDispatchSchedule.class.getName() + ".dispatch"))
            .toList();
        assertThat(tasks).singleElement().satisfies(task -> {
            assertThat(task.getTask()).isInstanceOf(FixedDelayTask.class);
            assertThat(((FixedDelayTask) task.getTask()).getIntervalDuration()).isEqualTo(Duration.ofSeconds(10));
        });
        assertThat(context.getBean(PushDispatcher.class).dispatch().due()).isZero();
    }
}
