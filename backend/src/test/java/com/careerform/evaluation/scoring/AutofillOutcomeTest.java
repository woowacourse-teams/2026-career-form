package com.careerform.evaluation.scoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("사용자 화면 기준 자동기입 결과와 자동기입 점수")
class AutofillOutcomeTest {

    @Test
    @DisplayName("확신도 0.8 이상만 넣은 것으로 보고, 넣지 않은 칸은 정답 유무로 맞게 비움과 놓침을 나눈다")
    void splitsFilledAndBlankByTruth() {
        Map<String, String> expected = new HashMap<>();
        expected.put("a", "k1");
        expected.put("b", "k2");
        expected.put("c", null);
        expected.put("d", "k4");
        expected.put("e", "k5");
        expected.put("f", null);
        expected.put("g", null);
        expected.put("h", "k8");
        expected.put("i", "k9");
        expected.put("j", null);
        Map<String, ObservedItem> observed = Map.of(
            "a", ObservedItem.answered("k1", 0.8),
            "b", ObservedItem.answered("other", 0.95),
            "c", ObservedItem.answered("k3", 0.9),
            "d", ObservedItem.answered("k4", 0.79),
            "e", ObservedItem.answered(null, 0.9),
            "f", ObservedItem.answered(null, 0.9),
            "g", ObservedItem.answered("k7", 0.3),
            "h", ObservedItem.unavailable(),
            "i", ObservedItem.answered("k9"));

        AutofillOutcome outcome = AutofillOutcome.score(expected, observed);

        assertThat(outcome).isEqualTo(new AutofillOutcome(1, 1, 1, 3, 2, 1));
        assertThat(outcome.plus(outcome)).isEqualTo(new AutofillOutcome(2, 2, 2, 6, 4, 2));
    }

    @Test
    @DisplayName("점수는 정밀도를 채움률보다 2배 중시하는 F0.5다")
    void scoresWithPrecisionWeighted() {
        AutofillOutcome careful = new AutofillOutcome(239, 0, 0, 120, 82, 0);
        AutofillOutcome eager = new AutofillOutcome(274, 23, 17, 103, 24, 0);

        assertThat(careful.precision()).isEqualTo(1.0);
        assertThat(careful.fillRate()).isCloseTo(239.0 / 321, within(1e-9));
        assertThat(careful.score()).isCloseTo(0.9358, within(1e-4));
        assertThat(eager.precision()).isCloseTo(274.0 / 314, within(1e-9));
        assertThat(eager.score()).isLessThan(careful.score());
    }

    @Test
    @DisplayName("아무것도 넣지 않으면 0점, 확신도를 모르는 답이 있거나 넣을 칸이 없으면 점수를 내지 않는다")
    void edgeCases() {
        assertThat(new AutofillOutcome(0, 0, 0, 10, 5, 0).score()).isZero();
        assertThat(new AutofillOutcome(0, 0, 0, 10, 5, 0).precision()).isNull();
        assertThat(new AutofillOutcome(3, 0, 0, 1, 0, 1).score()).isNull();
        assertThat(new AutofillOutcome(0, 0, 0, 4, 0, 0).score()).isNull();
    }
}
