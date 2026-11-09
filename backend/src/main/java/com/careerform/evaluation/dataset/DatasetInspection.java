package com.careerform.evaluation.dataset;

import java.util.Map;

/**
 * 화면 표시용으로 읽은 데이터셋. 해시와 형식은 검사했지만 사람 검토와 입력 동일성은 막지 않고 상태만 알려 준다.
 * {@code usable}이 false이면 평가 실행에 쓸 수 없고 {@code rejection}에 첫 거부 사유가 있다.
 */
public record DatasetInspection(
    LoadedDataset dataset,
    boolean usable,
    String rejection,
    Map<String, Map<String, String>> reviews
) {

    public DatasetInspection {
        reviews = Map.copyOf(reviews);
    }
}
