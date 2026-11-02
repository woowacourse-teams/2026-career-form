package com.careerform.evaluation.run;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.CallResult;
import com.careerform.evaluation.scoring.AutofillCounts;
import com.careerform.evaluation.scoring.CallScore;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.evaluation.scoring.ObservedItem;
import com.careerform.monitoring.ModelCallRecording.Attempt;

/**
 * 저장하는 호출 결과 한 건. 실행·반복·사례·순서가 키이며 같은 키는 한 번만 저장한다.
 * 정답 비교에 쓴 답({@code observed})과 시간·토큰 원자료를 함께 둬서 나중에 다시 채점할 수 있다.
 */
public record CallResultRecord(
    String runId,
    int repetition,
    String caseId,
    int order,
    CallKind kind,
    CallKind.Stage stage,
    FailureKind failure,
    CallScore score,
    Map<String, ObservedItem> observed,
    long productCallNanos,
    List<Attempt> attempts,
    Instant recordedAt,
    AutofillCounts autofill
) {

    public CallResultRecord {
        observed = Collections.unmodifiableMap(new LinkedHashMap<>(observed));
        attempts = List.copyOf(attempts);
    }

    /** 자동기입 결과가 없는 기록(필드 매핑이 아니거나 확신도를 기록하기 전 결과). */
    public CallResultRecord(String runId, int repetition, String caseId, int order, CallKind kind,
        CallKind.Stage stage, FailureKind failure, CallScore score, Map<String, ObservedItem> observed,
        long productCallNanos, List<Attempt> attempts, Instant recordedAt) {
        this(runId, repetition, caseId, order, kind, stage, failure, score, observed, productCallNanos, attempts,
            recordedAt, null);
    }

    public static CallResultRecord of(String runId, int repetition, String caseId, int order, ExecutedCall executed,
        Instant recordedAt) {
        CallResult result = executed.result();
        return new CallResultRecord(runId, repetition, caseId, order, result.kind(), result.stage(), result.failure(),
            result.score(), executed.observed(), executed.productCallNanos(), executed.attempts(), recordedAt,
            executed.autofill());
    }

    public String key() {
        return key(repetition, caseId, order);
    }

    public static String key(int repetition, String caseId, int order) {
        return repetition + "/" + caseId + "/" + order;
    }

    public CallResult toCallResult() {
        return score == null ? CallResult.failed(kind, stage, failure, attempts.size())
            : CallResult.completed(kind, stage, score, attempts.size());
    }
}
