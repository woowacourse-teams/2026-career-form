package com.careerform.evaluation.run;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.careerform.evaluation.scoring.CallResult;
import com.careerform.evaluation.scoring.AutofillCounts;
import com.careerform.evaluation.scoring.ObservedItem;
import com.careerform.monitoring.ModelCallRecording.Attempt;

/**
 * 호출 한 건의 실행 결과. {@code productCallNanos}는 제품 서비스 호출부터 반환까지의 시간이고,
 * {@code attempts}는 그 안의 모델 HTTP 시도별 시간·토큰이다. 실패한 호출은 {@code observed}가 비어 있다.
 * {@code autofill}은 필드 매핑 호출에만 있는 확신도 구간별 자동기입 결과다.
 */
public record ExecutedCall(
    CallResult result,
    Map<String, ObservedItem> observed,
    long productCallNanos,
    List<Attempt> attempts,
    AutofillCounts autofill
) {

    public ExecutedCall {
        observed = Collections.unmodifiableMap(new LinkedHashMap<>(observed));
        attempts = List.copyOf(attempts);
    }

    /** 자동기입 결과가 없는 호출(필드 매핑이 아니거나 실패). */
    public ExecutedCall(CallResult result, Map<String, ObservedItem> observed, long productCallNanos,
        List<Attempt> attempts) {
        this(result, observed, productCallNanos, attempts, null);
    }
}
