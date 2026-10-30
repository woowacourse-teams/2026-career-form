package com.careerform.evaluation.run;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.careerform.evaluation.scoring.CallResult;
import com.careerform.evaluation.scoring.ObservedItem;
import com.careerform.monitoring.ModelCallRecording.Attempt;

/**
 * 호출 한 건의 실행 결과. {@code productCallNanos}는 제품 서비스 호출부터 반환까지의 시간이고,
 * {@code attempts}는 그 안의 모델 HTTP 시도별 시간·토큰이다. 실패한 호출은 {@code observed}가 비어 있다.
 */
public record ExecutedCall(
    CallResult result,
    Map<String, ObservedItem> observed,
    long productCallNanos,
    List<Attempt> attempts
) {

    public ExecutedCall {
        observed = Collections.unmodifiableMap(new LinkedHashMap<>(observed));
        attempts = List.copyOf(attempts);
    }
}
