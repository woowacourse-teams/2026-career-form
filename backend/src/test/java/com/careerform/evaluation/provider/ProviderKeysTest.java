package com.careerform.evaluation.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("평가 공급자 키 묶음: 이름별 키와 그 키를 보낼 수 있는 호스트")
class ProviderKeysTest {

    @Test
    @DisplayName("이름, 키, 허용 호스트를 읽고 이름 목록만 바깥에 보인다")
    void parsesNamesKeysAndHosts() {
        ProviderKeys keys = ProviderKeys.parse("{\"deepseek\":{\"key\":\"sk-secret\",\"hosts\":[\"API.DeepSeek.com\"]},"
            + "\"together\":{\"key\":\"tg-secret\",\"hosts\":[\"api.together.xyz\"]}}");

        assertThat(keys.names()).containsExactly("deepseek", "together");
        assertThat(keys.hosts("deepseek")).isEqualTo(Set.of("api.deepseek.com"));
        assertThat(keys.secret("deepseek")).contains("sk-secret");
        assertThat(keys.secret("unknown")).isEmpty();
        assertThat(keys.toString()).doesNotContain("sk-secret", "tg-secret");
    }

    @Test
    @DisplayName("값이 없으면 키가 없는 묶음이다")
    void blankMeansNoKeys() {
        assertThat(ProviderKeys.parse(null).names()).isEmpty();
        assertThat(ProviderKeys.parse("  ").names()).isEmpty();
    }

    @Test
    @DisplayName("이름 형식, 빈 키, 빈 호스트, 와일드카드 호스트는 거부하고 오류에 키 값을 싣지 않는다")
    void rejectsInvalidEntriesWithoutLeakingSecrets() {
        for (String json : List.of(
            "{\"Bad Name\":{\"key\":\"sk-secret\",\"hosts\":[\"a.example.com\"]}}",
            "{\"deepseek\":{\"key\":\" \",\"hosts\":[\"a.example.com\"]}}",
            "{\"deepseek\":{\"key\":\"sk-secret\",\"hosts\":[]}}",
            "{\"deepseek\":{\"key\":\"sk-secret\",\"hosts\":[\"*.example.com\"]}}",
            "not json sk-secret")) {
            assertThatThrownBy(() -> ProviderKeys.parse(json))
                .isInstanceOf(IllegalStateException.class)
                .satisfies(error -> assertThat(error.getMessage()).doesNotContain("sk-secret"));
        }
    }
}
