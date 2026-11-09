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
            "id=\"management-panel\"", "id=\"posting-form\"", "id=\"delete-dialog\"", "id=\"summary\"", "최근 7일", "최근 30일");
        var postings = read("static/notifications/postings.js");
        assertThat(postings).contains("/quality/access.js", "\"/api/v1/notifications/admin\"", "api(\"/postings\"", "showModal", "/summary?from=");
        assertThat(postings).doesNotContain("localStorage", "sessionStorage");
        var login = read("static/quality/login.js");
        assertThat(login).contains("dataset.app");
        assertThat(read("static/quality/index.html")).contains("/notifications/");
        assertThat(new NotificationPageController().index()).isEqualTo("forward:/notifications/index.html");
    }

    @Test
    @DisplayName("등록 폼은 자유 글자 직무 입력 대신 분류 API의 대분류 선택과 소분류 체크박스로 직무 코드를 고르고 최소 1개를 안내하며, 대분류 전체·전체 직무 선택과 모두 해제 버튼을 둔다")
    void picksRoleCodesFromCategories() throws Exception {
        var index = read("static/notifications/index.html");
        assertThat(index).doesNotContain("name=\"role\"", "비우면 직무 없이", "직무를 비우면", "구독자 전원에게");
        assertThat(index).contains("for=\"role-category\"", "id=\"role-category\"", "id=\"role-options\"", "id=\"role-selected\"",
            "id=\"role-select-category\"", "id=\"role-select-all\"", "id=\"role-clear\"", "전체 직무", "받을 직무를 고른 구독자에게");
        assertThat(index).doesNotContain("최대 10개");
        var postings = read("static/notifications/postings.js");
        assertThat(postings).contains("/api/v1/notifications/job-categories", "roles:", "1개 이상", "분류를 불러올 수 없어 공고를 등록할 수 없습니다.",
            "분류에 있는 코드만 골라 주세요.", "role-select-category", "role-select-all", "role-clear", "전체 직무");
        assertThat(postings).doesNotContain("data.get(\"role\")", "localStorage", "sessionStorage", "MAX_ROLES", "최대 10개");
    }

    @Test
    @DisplayName("목록 카드는 서버가 파생한 직무 라벨을 제목에 쓰고 레거시 공고에만 직무 없음을 표시하며 요약 표에 직무 선택 구독 수를 둔다")
    void showsRoleLabelsAndRoleSelectedSubscriptions() throws Exception {
        var index = read("static/notifications/index.html");
        assertThat(index).contains("<th scope=\"col\">직무 선택 구독</th>", "colspan=\"12\"");
        assertThat(index).doesNotContain("colspan=\"11\"");
        var postings = read("static/notifications/postings.js");
        assertThat(postings).contains("row.role", "직무 없음", "!row.roles", "roleSelectedSubscriptions", "colSpan = 12");
        assertThat(postings).doesNotContain("colSpan = 11");
    }

    private static String read(String path) throws Exception {
        return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
    }
}
