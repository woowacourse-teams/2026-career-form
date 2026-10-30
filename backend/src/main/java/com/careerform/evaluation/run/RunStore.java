package com.careerform.evaluation.run;

import java.time.Instant;
import java.util.Optional;
import com.careerform.evaluation.prompt.PromptSnapshot;

/** 평가 실행 저장소. 진행 중(QUEUED, RUNNING) 실행은 저장소 전체에서 하나만 있을 수 있다. */
public interface RunStore {

    /** 등록하면 {@code registered}, 진행 중 실행이 있으면 그 실행을 {@code activeRun}으로 돌려준다. */
    Registration register(EvaluationRun run);

    Optional<EvaluationRun> find(String runId);

    /** 현재 상태가 {@code from}일 때만 {@code to}로 바꾼다. */
    boolean transition(String runId, RunStatus from, RunStatus to, Instant at);

    /** 실행 중인 실행에만 취소 요청을 표시한다. */
    boolean requestCancel(String runId);

    /** 같은 해시의 스냅샷이 이미 있으면 덮어쓰지 않는다. */
    void savePromptSnapshotIfAbsent(PromptSnapshot snapshot);

    /** 대기 중 실행이나 임대가 끝난 실행 중 실행을 {@code owner}의 임대로 가져간다. */
    Optional<EvaluationRun> claim(String owner, Instant now, java.time.Duration lease);

    /** 임대를 가진 작업자만 임대를 늘리고 처리 건수를 갱신한다. */
    boolean renew(String runId, String owner, Instant until, int processedCalls);

    /** 임대를 가진 작업자만 실행 중 실행을 끝난 상태로 바꾼다. */
    boolean finish(String runId, String owner, RunStatus to, Instant at);

    Optional<PromptSnapshot> findPromptSnapshot(String digest);

    record Registration(EvaluationRun registered, EvaluationRun activeRun) {
    }
}
