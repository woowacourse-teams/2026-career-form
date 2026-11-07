package com.careerform.evaluation.scoring;

/**
 * 제품 응답에서 꺼낸 항목 하나의 정규화한 답. {@code value}가 null이면 매핑 없음 또는 기권이다.
 * {@code providerUnavailable}은 공급자 사용 불가로 답하지 못한 항목이며 채점에서 뺀다.
 * {@code confidence}는 제품 응답의 확신도이며 필드 매핑에만 있고, 확신도를 기록하기 전 결과는 null이다.
 */
public record ObservedItem(String value, boolean providerUnavailable, Double confidence) {

    public ObservedItem {
        if (providerUnavailable && value != null) {
            throw new IllegalArgumentException("사용 불가 항목은 답을 가질 수 없습니다");
        }
    }

    public ObservedItem(String value, boolean providerUnavailable) {
        this(value, providerUnavailable, null);
    }

    public static ObservedItem answered(String value) {
        return new ObservedItem(value, false, null);
    }

    public static ObservedItem answered(String value, Double confidence) {
        return new ObservedItem(value, false, confidence);
    }

    public static ObservedItem unavailable() {
        return new ObservedItem(null, true, null);
    }
}
