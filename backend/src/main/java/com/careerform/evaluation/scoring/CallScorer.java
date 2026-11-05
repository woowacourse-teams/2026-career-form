package com.careerform.evaluation.scoring;

import java.util.Map;
import java.util.Objects;

/**
 * 정답표와 제품 응답을 항목 단위로 비교한다. 정답의 null은 매핑 불가 또는 기권이 정답이라는 뜻이다.
 * 누락과 불필요 제안은 그 항목의 오답이며 별도 감점은 없다.
 */
public final class CallScorer {

    /** 항목 하나의 판정. */
    public enum Verdict { CORRECT, WRONG_KEY, MISSING, UNNECESSARY, EXCLUDED }

    public static Verdict verdict(String want, ObservedItem item) {
        if (item.providerUnavailable()) {
            return Verdict.EXCLUDED;
        }
        if (Objects.equals(want, item.value())) {
            return Verdict.CORRECT;
        }
        if (want == null) {
            return Verdict.UNNECESSARY;
        }
        return item.value() == null ? Verdict.MISSING : Verdict.WRONG_KEY;
    }

    public CallScore score(Map<String, String> expected, Map<String, ObservedItem> observed) {
        for (String id : observed.keySet()) {
            if (!expected.containsKey(id)) {
                throw new IllegalArgumentException("정답표에 없는 응답 항목입니다: " + id);
            }
        }
        int[] counts = new int[Verdict.values().length];
        expected.forEach((id, want) ->
            counts[verdict(want, observed.getOrDefault(id, ObservedItem.answered(null))).ordinal()]++);
        return new CallScore(counts[Verdict.CORRECT.ordinal()], counts[Verdict.WRONG_KEY.ordinal()],
            counts[Verdict.MISSING.ordinal()], counts[Verdict.UNNECESSARY.ordinal()], counts[Verdict.EXCLUDED.ordinal()]);
    }
}
