package com.careerform.evaluation.scoring;

import java.util.Map;

/**
 * 칸 매핑 답을 사용자 화면에서 일어나는 일로 나눈 결과. 확장프로그램처럼 확신도 0.8 이상만 자동기입으로 본다.
 * 넣은 칸은 맞게 넣음, 다른 항목을 넣음, 넣지 말아야 할 칸에 넣음으로, 넣지 않은 칸(비움·확인 필요·막음)은
 * 정답이 없으면 맞게 비움, 있으면 놓침으로 나눈다. 확신도를 기록하지 않은 답은 확인 불가다.
 * 공급자를 쓸 수 없어 답하지 못한 칸도 사용자에게는 빈 칸이므로 같이 나눈다. 빼면 실패가 많은 모델의 점수가 오른다.
 */
public record AutofillOutcome(int filledCorrect, int filledWrongKey, int filledUnneeded, int blankCorrect, int missed,
    int unobserved) {

    /** 정밀도를 채움률보다 2배 중시한다. 잘못 넣은 칸은 사용자가 찾아 고쳐야 하고, 놓친 칸은 직접 입력하면 된다. */
    private static final double BETA = 0.5;

    /** 칸 하나의 결과. */
    public enum Kind { FILLED_CORRECT, FILLED_WRONG_KEY, FILLED_UNNEEDED, BLANK_CORRECT, MISSED, UNOBSERVED }

    public static Kind classify(String want, ObservedItem item) {
        if (item.value() != null && item.confidence() == null) {
            return Kind.UNOBSERVED;
        }
        if (item.value() != null && item.confidence() >= AutofillCounts.AUTO_MIN) {
            return item.value().equals(want) ? Kind.FILLED_CORRECT
                : want == null ? Kind.FILLED_UNNEEDED : Kind.FILLED_WRONG_KEY;
        }
        return want == null ? Kind.BLANK_CORRECT : Kind.MISSED;
    }

    /**
     * 칸 매핑이 아닌 질문(섹션 분류, 선택 결정)은 확신도와 무관하게 답 그대로 나눈다. 답한 것은 넣음, 답하지 않은 것은 비움으로
     * 보아 정답과 같은 4가지(맞게 넣음·맞게 비움·놓침·잘못 넣음)로 센다. 그래서 단계마다 같은 점수식을 쓸 수 있다.
     */
    public static Kind classifyAnswer(String want, ObservedItem item) {
        if (java.util.Objects.equals(want, item.value())) {
            return want == null ? Kind.BLANK_CORRECT : Kind.FILLED_CORRECT;
        }
        if (item.value() == null) {
            return Kind.MISSED;
        }
        return want == null ? Kind.FILLED_UNNEEDED : Kind.FILLED_WRONG_KEY;
    }

    /** 호출 종류에 맞는 분류로 센다. 칸 매핑은 {@link #classify}, 나머지는 {@link #classifyAnswer}다. */
    public static AutofillOutcome score(CallKind kind, Map<String, String> expected, Map<String, ObservedItem> observed) {
        if (kind == CallKind.GENERIC_FIELDS) {
            return score(expected, observed);
        }
        int[] counts = new int[Kind.values().length];
        expected.forEach((id, want) ->
            counts[classifyAnswer(want, observed.getOrDefault(id, ObservedItem.answered(null))).ordinal()]++);
        return of(counts);
    }

    public static AutofillOutcome score(Map<String, String> expected, Map<String, ObservedItem> observed) {
        int[] counts = new int[Kind.values().length];
        expected.forEach((id, want) ->
            counts[classify(want, observed.getOrDefault(id, ObservedItem.answered(null))).ordinal()]++);
        return of(counts);
    }

    private static AutofillOutcome of(int[] counts) {
        return new AutofillOutcome(counts[Kind.FILLED_CORRECT.ordinal()], counts[Kind.FILLED_WRONG_KEY.ordinal()],
            counts[Kind.FILLED_UNNEEDED.ordinal()], counts[Kind.BLANK_CORRECT.ordinal()], counts[Kind.MISSED.ordinal()],
            counts[Kind.UNOBSERVED.ordinal()]);
    }

    public AutofillOutcome plus(AutofillOutcome other) {
        return new AutofillOutcome(filledCorrect + other.filledCorrect, filledWrongKey + other.filledWrongKey,
            filledUnneeded + other.filledUnneeded, blankCorrect + other.blankCorrect, missed + other.missed,
            unobserved + other.unobserved);
    }

    /** 넣은 칸 중 맞은 비율. 넣은 칸이 없으면 null이다. */
    public Double precision() {
        int filled = filledCorrect + filledWrongKey + filledUnneeded;
        return filled == 0 ? null : (double) filledCorrect / filled;
    }

    /** 정답이 있는 칸 중 맞게 넣은 비율. 정답이 있는 칸이 없으면 null이다. */
    public Double fillRate() {
        int answerable = filledCorrect + filledWrongKey + missed;
        return answerable == 0 ? null : (double) filledCorrect / answerable;
    }

    /** 정밀도와 채움률의 F0.5. 확신도를 모르는 답이 있거나 정답이 있는 칸이 없으면 null, 아무것도 넣지 않으면 0이다. */
    public Double score() {
        Double fillRate = fillRate();
        if (unobserved > 0 || fillRate == null) {
            return null;
        }
        Double precision = precision();
        if (precision == null || precision + fillRate == 0) {
            return 0.0;
        }
        double weight = BETA * BETA;
        return (1 + weight) * precision * fillRate / (weight * precision + fillRate);
    }
}
