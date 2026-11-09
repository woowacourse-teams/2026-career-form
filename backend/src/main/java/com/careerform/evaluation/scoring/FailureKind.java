package com.careerform.evaluation.scoring;

/** 정확도에서 빠지고 실패율에 들어가는 호출의 원인. */
public enum FailureKind {
    TIMEOUT,
    API_ERROR,
    INVALID_RESPONSE,
    /** 응답은 받았지만 모든 항목이 공급자 사용 불가라 채점할 항목이 없다. */
    NOT_SCORABLE
}
