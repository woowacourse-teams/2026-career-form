package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

@DisplayName("푸시 payload")
class PushPayloadTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");

    @Test
    @DisplayName("공고 ID, 회사, 직무, 링크, 접수 시작, 마감, FCM 요청 시각만 ISO-8601 문자열로 싣는다")
    void serializesPostingFieldsAsJson() {
        var posting = new JobPosting("0123456789abcdef0123456789abcdef", "합성 회사", "합성 직무", "https://careers.example.test/jobs/1",
            NOW.minusSeconds(60), NOW.plusSeconds(3600), NOW.minusSeconds(120));
        var json = JsonMapper.builder().build().readTree(new String(PushPayload.of(posting, NOW), StandardCharsets.UTF_8));
        assertThat(json.path("id").asString()).isEqualTo("0123456789abcdef0123456789abcdef");
        assertThat(json.path("company").asString()).isEqualTo("합성 회사");
        assertThat(json.path("role").asString()).isEqualTo("합성 직무");
        assertThat(json.path("link").asString()).isEqualTo("https://careers.example.test/jobs/1");
        assertThat(json.path("opensAt").asString()).isEqualTo("2029-12-31T23:59:00Z");
        assertThat(json.path("closesAt").asString()).isEqualTo("2030-01-01T01:00:00Z");
        assertThat(json.path("sentAt").asString()).isEqualTo("2030-01-01T00:00:00Z");
        assertThat(json.has("registeredAt")).isFalse();
        assertThat(json.size()).isEqualTo(7);
    }

    @Test
    @DisplayName("직무가 없는 공고는 role 필드를 생략한다")
    void omitsRoleWhenAbsent() {
        var posting = new JobPosting("0123456789abcdef0123456789abcdef", "합성 회사", null, "https://careers.example.test/jobs/2",
            NOW.minusSeconds(60), NOW.plusSeconds(3600), NOW.minusSeconds(120));
        var json = JsonMapper.builder().build().readTree(new String(PushPayload.of(posting, NOW), StandardCharsets.UTF_8));
        assertThat(json.has("role")).isFalse();
        assertThat(json.size()).isEqualTo(6);
        assertThat(json.path("sentAt").asString()).isEqualTo("2030-01-01T00:00:00Z");
        assertThat(json.path("company").asString()).isEqualTo("합성 회사");
    }

    @Test
    @DisplayName("회사 80자, 직무 120자, 링크 1024자 상한에서도 암호화 여유를 둔 4KB 한도 안에 든다")
    void staysUnderWebPushLimitForMaximalInputs() {
        var link = "https://careers.example.test/" + "a".repeat(1024 - "https://careers.example.test/".length());
        var posting = new JobPosting("0123456789abcdef0123456789abcdef", "회".repeat(80), "직".repeat(120), link,
            NOW.minusSeconds(60), NOW.plusSeconds(3600), NOW.minusSeconds(120));
        var payload = PushPayload.of(posting, NOW);
        assertThat(payload.length).isLessThanOrEqualTo(PushPayload.MAX_PLAINTEXT_BYTES);
        assertThat(PushPayload.MAX_PLAINTEXT_BYTES + PushPayload.AES128GCM_OVERHEAD_BYTES).isLessThanOrEqualTo(4096);
    }
}
