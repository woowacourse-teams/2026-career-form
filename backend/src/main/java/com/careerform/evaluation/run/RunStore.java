package com.careerform.evaluation.run;

import java.time.Instant;
import java.util.Optional;
import com.careerform.evaluation.prompt.PromptSnapshot;

/**
 * 평가 실행 저장소. 진행 중(QUEUED, RUNNING) 실행은 저장소 전체에서 하나만 있을 수 있다. 비교 실행의 나머지 실행은
 * WAITING으로 기다리며, 끝나지 않은 실행(WAITING 포함)이 있으면 새 등록을 받지 않는다.
 */
public interface RunStore {

    /** 등록하면 {@code registered}, 끝나지 않은 실행이 있으면 그 실행을 {@code activeRun}으로 돌려준다. */
    Registration register(EvaluationRun run);

    /**
     * 같은 비교의 실행들을 순서대로 등록한다. 첫 실행은 QUEUED, 나머지는 WAITING이다. {@code registered}는 첫 실행이다.
     * 끝나지 않은 실행이 있으면 아무것도 등록하지 않는다.
     */
    Registration registerComparison(java.util.List<EvaluationRun> runs);

    /** 비교에 속한 실행을 등록 순서대로. */
    java.util.List<EvaluationRun> comparison(String comparisonId);

    /** 진행 중 실행이 없으면 가장 먼저 등록된 WAITING 실행 하나를 QUEUED로 올린다. 올렸으면 true. */
    boolean promoteWaiting();

    Optional<EvaluationRun> find(String runId);

    /** 현재 상태가 {@code from}일 때만 {@code to}로 바꾼다. */
    boolean transition(String runId, RunStatus from, RunStatus to, Instant at);

    /** 실행 중인 실행에만 취소 요청을 표시한다. */
    boolean requestCancel(String runId);

    /** 같은 해시의 스냅샷이 이미 있으면 덮어쓰지 않는다. */
    void savePromptSnapshotIfAbsent(PromptSnapshot snapshot);

    /** 최근 등록 순으로 최대 {@code limit}건. */
    java.util.List<EvaluationRun> recent(int limit);

    /** 대기 중 실행이나 임대가 끝난 실행 중 실행을 {@code owner}의 임대로 가져간다. */
    Optional<EvaluationRun> claim(String owner, Instant now, java.time.Duration lease);

    /** 임대를 가진 작업자만 임대를 늘리고 처리 건수를 갱신한다. */
    boolean renew(String runId, String owner, Instant until, int processedCalls);

    /** 임대를 가진 작업자만 실행 중 실행을 끝난 상태로 바꾼다. */
    boolean finish(String runId, String owner, RunStatus to, Instant at);

    Optional<PromptSnapshot> findPromptSnapshot(String digest);

    /** 고른 실행 중 끝난 실행만 지운다(프롬프트 스냅샷은 남긴다). 지운 수. */
    int deleteFinished(java.util.Collection<String> runIds);

    record Registration(EvaluationRun registered, EvaluationRun activeRun) {
    }
}
