package com.careerform.evaluation.scoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("평가 호출 하나의 항목 채점")
class CallScorerTest {

    private final CallScorer scorer = new CallScorer();

    @Test
    @DisplayName("정답, 다른 키, 누락, 불필요 제안을 칸 단위로 맞음과 틀림으로 나눈다")
    void classifiesEachItem() {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("field-1", "personal.personal.email");
        expected.put("field-2", "personal.personal.phone");
        expected.put("field-3", "education.university.schoolName");
        expected.put("field-4", null);
        expected.put("field-5", null);
        Map<String, ObservedItem> observed = Map.of(
            "field-1", ObservedItem.answered("personal.personal.email"),
            "field-2", ObservedItem.answered("personal.personal.mobile"),
            "field-3", ObservedItem.answered(null),
            "field-4", ObservedItem.answered("personal.personal.address"),
            "field-5", ObservedItem.answered(null));

        CallScore score = scorer.score(expected, observed);

        assertThat(score.correct()).isEqualTo(2);
        assertThat(score.wrongKey()).isEqualTo(1);
        assertThat(score.missing()).isEqualTo(1);
        assertThat(score.unnecessary()).isEqualTo(1);
        assertThat(score.excluded()).isZero();
        assertThat(score.score()).isEqualTo(0.4);
    }

    @Test
    @DisplayName("공급자 사용 불가로 답하지 못한 칸은 오답이 아니라 채점에서 뺀다")
    void excludesUnavailableItems() {
        Map<String, String> expected = Map.of("field-1", "personal.personal.email", "field-2", "personal.personal.phone");
        Map<String, ObservedItem> observed = Map.of(
            "field-1", ObservedItem.answered("personal.personal.email"),
            "field-2", ObservedItem.unavailable());

        CallScore score = scorer.score(expected, observed);

        assertThat(score.excluded()).isEqualTo(1);
        assertThat(score.score()).isEqualTo(1.0);
        assertThat(score.scorable()).isTrue();
    }

    @Test
    @DisplayName("모든 칸이 빠지면 채점 불가 호출이 된다")
    void allExcludedIsNotScorable() {
        CallScore score = scorer.score(Map.of("field-1", "personal.personal.email"),
            Map.of("field-1", ObservedItem.unavailable()));

        assertThat(score.scorable()).isFalse();
        assertThat(score.score()).isNull();
    }

    @Test
    @DisplayName("응답에 없는 정답 칸은 누락이다")
    void absentResponseItemIsMissing() {
        CallScore score = scorer.score(Map.of("field-1", "personal.personal.email"), Map.of());

        assertThat(score.missing()).isEqualTo(1);
        assertThat(score.score()).isEqualTo(0.0);
    }

    @Test
    @DisplayName("기권이 정답인 준비 결정에서 기권하면 맞음이다")
    void abstainIsCorrectWhenExpected() {
        CallScore score = scorer.score(nullExpected("structure"), Map.of("structure", ObservedItem.answered(null)));

        assertThat(score.correct()).isEqualTo(1);
    }

    @Test
    @DisplayName("정답표에 없는 응답 칸은 채점 계약 위반으로 거부한다")
    void rejectsUngradedResponseItems() {
        assertThatThrownBy(() -> scorer.score(Map.of("field-1", "a"),
            Map.of("field-1", ObservedItem.answered("a"), "field-9", ObservedItem.answered("b"))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("field-9");
    }

    @Test
    @DisplayName("정답 항목이 없는 호출은 채점 불가다")
    void emptyExpectedIsNotScorable() {
        assertThat(scorer.score(Map.of(), Map.of()).scorable()).isFalse();
    }

    private static Map<String, String> nullExpected(String id) {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put(id, null);
        return expected;
    }
}
