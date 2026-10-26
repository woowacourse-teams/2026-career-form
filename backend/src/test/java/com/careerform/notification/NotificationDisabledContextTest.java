package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false",
    "management.health.mongodb.enabled=false",
    "career-form.notification.enabled=false"
})
@AutoConfigureMockMvc
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@DisplayName("알림 기능 토글이 꺼진 애플리케이션 컨텍스트")
class NotificationDisabledContextTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ApplicationContext context;

    @MockitoBean
    private FormAnalysisCompanyMongoRepository companies;

    @Test
    @DisplayName("확장용·관리용 API가 모두 404로 응답하고 알림 bean이 없다")
    void exposesNoNotificationEndpointsOrBeans() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/vapid-public-key")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/notifications/postings")).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/v1/notifications/subscriptions").contentType(MediaType.APPLICATION_JSON)
            .content("{\"endpoint\":\"https://fcm.googleapis.com/fcm/send/x\",\"keys\":{\"p256dh\":\"a\",\"auth\":\"b\"}}")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/notifications/admin/postings")).andExpect(status().isNotFound());
        assertThat(context.getBeansOfType(NotificationStore.class)).isEmpty();
        assertThat(context.getBeansOfType(JobPostingService.class)).isEmpty();
        assertThat(context.getBeansOfType(VapidKeys.class)).isEmpty();
    }
}
