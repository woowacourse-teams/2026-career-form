package com.careerform.evaluation.prompt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.formanalysis.application.PromptSource;

@DisplayName("모델 프롬프트 스냅샷과 버전 해시")
class PromptCatalogTest {

    private final PromptCatalog catalog = new PromptCatalog();

    @Test
    @DisplayName("프롬프트 조각을 출처별 이름으로 모으고 sha256 해시를 붙인다")
    void collectsPartsWithDigest() {
        PromptSnapshot snapshot = catalog.snapshot(List.of(source("b", Map.of("x", "two")), source("a", Map.of("x", "one"))));

        assertThat(snapshot.parts()).containsExactly(Map.entry("a/x", "one"), Map.entry("b/x", "two"));
        assertThat(snapshot.digest()).matches("[0-9a-f]{64}");
    }

    @Test
    @DisplayName("출처 순서가 달라도 같은 내용이면 같은 해시다")
    void digestIgnoresSourceOrder() {
        var first = catalog.snapshot(List.of(source("a", Map.of("x", "one", "y", "two")), source("b", Map.of("z", "3"))));
        var second = catalog.snapshot(List.of(source("b", Map.of("z", "3")), source("a", Map.of("y", "two", "x", "one"))));

        assertThat(second.digest()).isEqualTo(first.digest());
    }

    @Test
    @DisplayName("문장 하나만 바뀌어도 해시가 바뀐다")
    void digestChangesWithAnyText() {
        var before = catalog.snapshot(List.of(source("a", Map.of("x", "Choose ABSTAIN."))));
        var after = catalog.snapshot(List.of(source("a", Map.of("x", "Choose ABSTAIN!"))));

        assertThat(after.digest()).isNotEqualTo(before.digest());
    }

    @Test
    @DisplayName("이름과 내용의 경계를 바꾼 조각은 다른 해시다")
    void digestSeparatesNameAndText() {
        var first = catalog.snapshot(List.of(source("a", Map.of("x", "yz"))));
        var second = catalog.snapshot(List.of(source("a", Map.of("xy", "z"))));

        assertThat(second.digest()).isNotEqualTo(first.digest());
    }

    @Test
    @DisplayName("같은 출처 이름이 둘이면 거부한다")
    void rejectsDuplicateSources() {
        assertThatThrownBy(() -> catalog.snapshot(List.of(source("a", Map.of("x", "1")), source("a", Map.of("y", "2")))))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("빈 조각은 거부한다")
    void rejectsEmptyParts() {
        assertThatThrownBy(() -> catalog.snapshot(List.of(source("a", Map.of("x", " ")))))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> catalog.snapshot(List.of()))
            .isInstanceOf(IllegalStateException.class);
    }

    private static PromptSource source(String id, Map<String, String> parts) {
        return new PromptSource() {
            @Override public String promptSourceId() { return id; }
            @Override public Map<String, String> promptParts() { return parts; }
        };
    }
}
