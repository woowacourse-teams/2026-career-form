package com.careerform.evaluation.scoring;

import java.util.Map;

/**
 * 필드 매핑 답을 제품과 같은 확신도 구간으로 나눈 결과. 확장프로그램 field-grading.ts와 같은 경계를 쓴다:
 * 0.8 이상은 자동기입(정답·오답), 0.5 이상은 사용자 확인 필요, 그 아래는 막음이다. 답이 없으면 비움, 확신도를
 * 기록하지 않은 답은 미관측이다. 이름 칸 보정, 정확히 일치하는 값 올림 같은 확장프로그램의 추가 규칙은 반영하지 않는다.
 */
public record AutofillCounts(int autoCorrect, int autoWrong, int review, int blocked, int empty, int unobserved) {

    public static final double AUTO_MIN = 0.8;
    public static final double REVIEW_MIN = 0.5;
    public static final AutofillCounts ZERO = new AutofillCounts(0, 0, 0, 0, 0, 0);

    public static AutofillCounts score(Map<String, String> expected, Map<String, ObservedItem> observed) {
        int autoCorrect = 0;
        int autoWrong = 0;
        int review = 0;
        int blocked = 0;
        int empty = 0;
        int unobserved = 0;
        for (Map.Entry<String, String> entry : expected.entrySet()) {
            ObservedItem item = observed.get(entry.getKey());
            if (item == null || item.providerUnavailable()) {
                continue;
            }
            if (item.value() == null) {
                empty++;
            }
            else if (item.confidence() == null) {
                unobserved++;
            }
            else if (item.confidence() >= AUTO_MIN) {
                if (item.value().equals(entry.getValue())) {
                    autoCorrect++;
                }
                else {
                    autoWrong++;
                }
            }
            else if (item.confidence() >= REVIEW_MIN) {
                review++;
            }
            else {
                blocked++;
            }
        }
        return new AutofillCounts(autoCorrect, autoWrong, review, blocked, empty, unobserved);
    }

    public AutofillCounts plus(AutofillCounts other) {
        return new AutofillCounts(autoCorrect + other.autoCorrect, autoWrong + other.autoWrong,
            review + other.review, blocked + other.blocked, empty + other.empty, unobserved + other.unobserved);
    }
}
