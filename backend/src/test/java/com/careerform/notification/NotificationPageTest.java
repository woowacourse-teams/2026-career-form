package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

@DisplayName("공고 관리 화면 정적 자원")
class NotificationPageTest {
    @Test
    @DisplayName("관리 화면은 품질 로그인 틀을 재사용하고 공고 관리 모듈을 로그인 뒤에 불러온다")
    void reusesQualityLoginShell() throws Exception {
        var index = read("static/notifications/index.html");
        assertThat(index).contains("/quality/quality.css", "/quality/login.js", "data-app=\"/notifications/postings.js\"", "id=\"login-form\"",
            "id=\"management-panel\"", "id=\"posting-form\"", "id=\"delete-dialog\"");
        var postings = read("static/notifications/postings.js");
        assertThat(postings).contains("/quality/access.js", "/api/v1/notifications/admin/postings", "showModal");
        assertThat(postings).doesNotContain("localStorage", "sessionStorage");
        var login = read("static/quality/login.js");
        assertThat(login).contains("dataset.app");
        assertThat(read("static/quality/index.html")).contains("/notifications/");
        assertThat(new NotificationPageController().index()).isEqualTo("forward:/notifications/index.html");
    }

    private static String read(String path) throws Exception {
        return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
    }
}
