package com.careerform.evaluation.run;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 평가 기록 삭제. 화면의 비교 묶음 하나(비교 ID, 단독 실행이면 실행 ID)를 지운다. 묶음의 실행·호출 결과·재채점 이력을
 * 지우고 프롬프트 스냅샷은 다른 실행이 쓸 수 있어 남긴다. 끝나지 않은 실행이 하나라도 있으면 아무것도 지우지 않는다.
 * 누가 무엇을 지웠는지는 서버 로그에 남긴다.
 */
public final class RunDeletionService {

    private static final Logger log = LoggerFactory.getLogger(RunDeletionService.class);

    private final RunStore runs;
    private final ResultStore results;
    private final ScoringStore scorings;

    public RunDeletionService(RunStore runs, ResultStore results, ScoringStore scorings) {
        this.runs = runs;
        this.results = results;
        this.scorings = scorings;
    }

    public record Deleted(List<String> runIds, long results) {

        public Deleted {
            runIds = List.copyOf(runIds);
        }
    }

    public Deleted delete(String recordKey, String requestedBy) {
        List<EvaluationRun> group = runs.comparison(recordKey);
        if (group.isEmpty()) {
            group = runs.find(recordKey).filter(run -> run.comparisonId() == null).map(List::of)
                .orElseThrow(() -> new RunRejected(RunRejected.Code.UNKNOWN_RUN));
        }
        group.stream().filter(run -> run.status().pending()).findFirst().ifPresent(run -> {
            throw new RunRejected(RunRejected.Code.RUN_ACTIVE, run.id(), false);
        });
        List<String> ids = group.stream().map(EvaluationRun::id).toList();
        long deletedResults = results.delete(ids);
        scorings.delete(ids);
        runs.deleteFinished(ids);
        log.info("EVALUATION_RECORD_DELETED key={} runs={} results={} by={}", recordKey, ids, deletedResults,
            requestedBy);
        return new Deleted(ids, deletedResults);
    }
}
