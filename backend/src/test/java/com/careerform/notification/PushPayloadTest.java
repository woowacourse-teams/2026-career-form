package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("푸시 payload")
class PushPayloadTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");

    @Test
    @DisplayName("공고 ID, 회사, 직무 라벨, 직무 코드 배열, 링크, 접수 시작, 마감, FCM 요청 시각만 싣고 roles는 role 바로 뒤에 온다")
    void serializesPostingFieldsAsJson() {
        var posting = new JobPosting("0123456789abcdef0123456789abcdef", "합성 회사", "백엔드·프론트엔드", List.of("IT.BACKEND", "IT.FRONTEND"),
            "https://careers.example.test/jobs/1", NOW.minusSeconds(60), NOW.plusSeconds(3600), NOW.minusSeconds(120));
        var text = new String(PushPayload.of(posting, NOW), StandardCharsets.UTF_8);
        var json = JsonMapper.builder().build().readTree(text);
        assertThat(json.path("id").asString()).isEqualTo("0123456789abcdef0123456789abcdef");
        assertThat(json.path("company").asString()).isEqualTo("합성 회사");
        assertThat(json.path("role").asString()).isEqualTo("백엔드·프론트엔드");
        assertThat(json.path("roles").isArray()).isTrue();
        assertThat(json.path("roles").values()).extracting(JsonNode::asString).containsExactly("IT.BACKEND", "IT.FRONTEND");
        assertThat(json.path("link").asString()).isEqualTo("https://careers.example.test/jobs/1");
        assertThat(json.path("opensAt").asString()).isEqualTo("2029-12-31T23:59:00Z");
        assertThat(json.path("closesAt").asString()).isEqualTo("2030-01-01T01:00:00Z");
        assertThat(json.path("sentAt").asString()).isEqualTo("2030-01-01T00:00:00Z");
        assertThat(json.has("registeredAt")).isFalse();
        assertThat(json.size()).isEqualTo(8);
        assertThat(text).contains("\"role\":\"백엔드·프론트엔드\",\"roles\":[\"IT.BACKEND\",\"IT.FRONTEND\"],\"link\":");
    }

    @Test
    @DisplayName("직무가 없는 레거시 공고는 role과 roles 필드를 모두 생략한다")
    void omitsRoleFieldsForLegacyPosting() {
        var posting = new JobPosting("0123456789abcdef0123456789abcdef", "합성 회사", null, null, "https://careers.example.test/jobs/2",
            NOW.minusSeconds(60), NOW.plusSeconds(3600), NOW.minusSeconds(120));
        var json = JsonMapper.builder().build().readTree(new String(PushPayload.of(posting, NOW), StandardCharsets.UTF_8));
        assertThat(json.has("role")).isFalse();
        assertThat(json.has("roles")).isFalse();
        assertThat(json.size()).isEqualTo(6);
        assertThat(json.path("sentAt").asString()).isEqualTo("2030-01-01T00:00:00Z");
        assertThat(json.path("company").asString()).isEqualTo("합성 회사");
    }

    @Test
    @DisplayName("회사 80자, 직무 120자, 링크 1024자에 65자 소분류 코드 10개를 더한 상한에서도 암호화 여유를 둔 4KB 한도 안에 든다")
    void staysUnderWebPushLimitForMaximalInputs() {
        assertThat(maximalRoles()).hasSize(10).doesNotHaveDuplicates().allSatisfy(code -> assertThat(code).hasSize(65));
        var payload = PushPayload.of(maximalPosting(), NOW);
        assertThat(payload.length).isLessThanOrEqualTo(PushPayload.MAX_PLAINTEXT_BYTES);
        assertThat(PushPayload.MAX_PLAINTEXT_BYTES + PushPayload.AES128GCM_OVERHEAD_BYTES).isLessThanOrEqualTo(4096);
    }

    /** 대분류 32자 + `.` + 소분류 32자인 합성 코드 10개. 분류 검증을 거치지 않고 JobPosting에 직접 넣는다. */
    static List<String> maximalRoles() {
        return IntStream.range(0, 10).mapToObj(index -> ("R" + index).repeat(16) + "." + ("S" + index).repeat(16)).toList();
    }

    /** 회사 80자, 직무 라벨 120자, 링크 1024자, 소분류 코드 10개의 상한 공고. */
    static JobPosting maximalPosting() {
        var link = "https://careers.example.test/" + "a".repeat(1024 - "https://careers.example.test/".length());
        return new JobPosting("0123456789abcdef0123456789abcdef", "회".repeat(80), "직".repeat(120), maximalRoles(), link,
            NOW.minusSeconds(60), NOW.plusSeconds(3600), NOW.minusSeconds(120));
    }
}
