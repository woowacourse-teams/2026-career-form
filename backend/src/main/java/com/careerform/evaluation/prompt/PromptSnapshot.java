package com.careerform.evaluation.prompt;

import java.util.Collections;
import java.util.SortedMap;
import java.util.TreeMap;

/** 평가 실행 시점의 프롬프트 조각 전문과 그 해시. 같은 해시면 같은 프롬프트 버전이다. */
public record PromptSnapshot(String digest, SortedMap<String, String> parts) {

    public PromptSnapshot {
        parts = Collections.unmodifiableSortedMap(new TreeMap<>(parts));
    }
}
