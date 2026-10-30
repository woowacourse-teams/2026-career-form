package com.careerform.evaluation.scoring;

import java.util.Map;
import java.util.Objects;

/**
 * 정답표와 제품 응답을 항목 단위로 비교한다. 정답의 null은 매핑 불가 또는 기권이 정답이라는 뜻이다.
 * 누락과 불필요 제안은 그 항목의 오답이며 별도 감점은 없다.
 */
public final class CallScorer {

    public CallScore score(Map<String, String> expected, Map<String, ObservedItem> observed) {
        for (String id : observed.keySet()) {
            if (!expected.containsKey(id)) {
                throw new IllegalArgumentException("정답표에 없는 응답 항목입니다: " + id);
            }
        }
        int correct = 0;
        int wrongKey = 0;
        int missing = 0;
        int unnecessary = 0;
        int excluded = 0;
        for (Map.Entry<String, String> entry : expected.entrySet()) {
            ObservedItem item = observed.getOrDefault(entry.getKey(), ObservedItem.answered(null));
            String want = entry.getValue();
            if (item.providerUnavailable()) {
                excluded++;
            }
            else if (Objects.equals(want, item.value())) {
                correct++;
            }
            else if (want == null) {
                unnecessary++;
            }
            else if (item.value() == null) {
                missing++;
            }
            else {
                wrongKey++;
            }
        }
        return new CallScore(correct, wrongKey, missing, unnecessary, excluded);
    }
}
