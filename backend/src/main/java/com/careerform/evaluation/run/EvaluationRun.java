package com.careerform.evaluation.run;

import java.time.Instant;

/**
 * 평가 실행 한 건. {@code plannedCalls}는 채점할 제품 API 호출 수, {@code estimatedModelCalls}는
 * 데이터셋에 기록된 내부 모델 호출 수로 계산한 예상치다. 시각은 아직 없으면 null이다.
 */
public record EvaluationRun(
    String id,
    String fingerprint,
    RunVersions versions,
    int repetitions,
    int plannedCalls,
    int estimatedModelCalls,
    String requestedBy,
    Instant requestedAt,
    RunStatus status,
    Instant startedAt,
    Instant finishedAt,
    int processedCalls,
    boolean cancelRequested,
    String leaseOwner,
    Instant leaseUntil
) {

    public static EvaluationRun queued(String id, String fingerprint, RunVersions versions, int repetitions,
        int plannedCalls, int estimatedModelCalls, String requestedBy, Instant requestedAt) {
        return new EvaluationRun(id, fingerprint, versions, repetitions, plannedCalls, estimatedModelCalls,
            requestedBy, requestedAt, RunStatus.QUEUED, null, null, 0, false, null, null);
    }

    EvaluationRun moved(RunStatus next, Instant at) {
        Instant started = next == RunStatus.RUNNING ? at : startedAt;
        Instant finished = next.active() ? finishedAt : at;
        return new EvaluationRun(id, fingerprint, versions, repetitions, plannedCalls, estimatedModelCalls,
            requestedBy, requestedAt, next, started, finished, processedCalls, cancelRequested,
            next == RunStatus.RUNNING ? leaseOwner : null, next == RunStatus.RUNNING ? leaseUntil : null);
    }

    EvaluationRun cancellationRequested() {
        return new EvaluationRun(id, fingerprint, versions, repetitions, plannedCalls, estimatedModelCalls,
            requestedBy, requestedAt, status, startedAt, finishedAt, processedCalls, true, leaseOwner, leaseUntil);
    }

    EvaluationRun leased(String owner, Instant now, Instant until) {
        return new EvaluationRun(id, fingerprint, versions, repetitions, plannedCalls, estimatedModelCalls,
            requestedBy, requestedAt, RunStatus.RUNNING, startedAt == null ? now : startedAt, finishedAt,
            processedCalls, cancelRequested, owner, until);
    }

    EvaluationRun progressed(Instant until, int processed) {
        return new EvaluationRun(id, fingerprint, versions, repetitions, plannedCalls, estimatedModelCalls,
            requestedBy, requestedAt, status, startedAt, finishedAt, processed, cancelRequested, leaseOwner, until);
    }

    boolean leaseExpired(Instant now) {
        return leaseUntil == null || !leaseUntil.isAfter(now);
    }
}
