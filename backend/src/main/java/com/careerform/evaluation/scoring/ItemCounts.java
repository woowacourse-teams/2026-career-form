package com.careerform.evaluation.scoring;

/** 실행 전체의 항목 판정 합계. */
public record ItemCounts(long correct, long wrongKey, long missing, long unnecessary, long excluded) {

    static final ItemCounts ZERO = new ItemCounts(0, 0, 0, 0, 0);

    ItemCounts plus(CallScore score) {
        return new ItemCounts(correct + score.correct(), wrongKey + score.wrongKey(), missing + score.missing(),
            unnecessary + score.unnecessary(), excluded + score.excluded());
    }
}
