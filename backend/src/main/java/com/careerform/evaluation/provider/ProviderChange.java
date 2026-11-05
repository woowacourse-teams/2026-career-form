package com.careerform.evaluation.provider;

import java.time.Instant;

/** 공급자 등록 변경 기록. {@code summary}는 바뀐 설정 값이며 키 원문은 담지 않는다. */
public record ProviderChange(String name, Action action, String by, Instant at, String summary) {

    public enum Action {
        CREATED,
        UPDATED,
        DISABLED
    }
}
