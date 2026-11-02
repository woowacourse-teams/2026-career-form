package com.careerform.evaluation.scoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("제품과 같은 확신도 구간으로 본 자동기입 결과")
class AutofillCountsTest {

    @Test
    @DisplayName("0.8 이상은 자동기입(정답·오답), 0.5 이상은 확인 필요, 그 아래는 막음, 답이 없으면 비움이다")
    void bandsByProductThresholds() {
        Map<String, String> expected = new HashMap<>();
        expected.put("a", "k1");
        expected.put("b", "k2");
        expected.put("c", "k3");
        expected.put("d", "k4");
        expected.put("e", null);
        expected.put("f", "k6");
        expected.put("g", null);
        expected.put("h", "k8");
        Map<String, ObservedItem> observed = Map.of(
            "a", ObservedItem.answered("k1", 0.8),
            "b", ObservedItem.answered("wrong", 0.95),
            "c", ObservedItem.answered("k3", 0.5),
            "d", ObservedItem.answered("k4", 0.49),
            "e", ObservedItem.answered("k5", 0.9),
            "f", ObservedItem.answered(null, 0.0),
            "g", ObservedItem.unavailable(),
            "h", ObservedItem.answered("k8"));

        AutofillCounts counts = AutofillCounts.score(expected, observed);

        assertThat(counts).isEqualTo(new AutofillCounts(1, 2, 1, 1, 1, 1));
        assertThat(counts.plus(counts)).isEqualTo(new AutofillCounts(2, 4, 2, 2, 2, 2));
    }
}
