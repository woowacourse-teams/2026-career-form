package com.careerform.evaluation.scoring;

/** 호출 하나의 항목별 판정 수. 점수는 맞힌 항목 수를 채점한 항목 수로 나눈 값이며 부분 점수는 없다. */
public record CallScore(int correct, int wrongKey, int missing, int unnecessary, int excluded) {

    public CallScore {
        if (correct < 0 || wrongKey < 0 || missing < 0 || unnecessary < 0 || excluded < 0) {
            throw new IllegalArgumentException("판정 수는 음수일 수 없습니다");
        }
    }

    public int scored() {
        return correct + wrongKey + missing + unnecessary;
    }

    public boolean scorable() {
        return scored() > 0;
    }

    /** 채점할 항목이 없으면 null이다. */
    public Double score() {
        return scorable() ? (double) correct / scored() : null;
    }
}
