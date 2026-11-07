package com.careerform.evaluation.run;

import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.careerform.evaluation.dataset.CaseCall;
import com.careerform.evaluation.dataset.EvaluationCase;
import com.careerform.evaluation.dataset.LoadedDataset;
import com.careerform.evaluation.scoring.CallResult;
import com.careerform.evaluation.scoring.CallScorer;
import com.careerform.evaluation.scoring.RunAggregator;

/**
 * 저장한 답을 실행 때의 데이터셋 정답과 현재 채점 기준으로 다시 채점하고 새 기록으로 남긴다.
 * 호출 결과와 이전 채점 기록은 바꾸지 않는다. 실패한 호출은 실패로 남는다.
 */
public final class RescoringService {

    @FunctionalInterface
    public interface DatasetSource {
        LoadedDataset load(String datasetId, int version);
    }

    private final RunStore runs;
    private final ResultStore results;
    private final ScoringStore scorings;
    private final DatasetSource datasets;
    private final Clock clock;
    private final CallScorer scorer = new CallScorer();
    private final RunAggregator aggregator = new RunAggregator();

    public RescoringService(RunStore runs, ResultStore results, ScoringStore scorings, DatasetSource datasets,
        Clock clock) {
        this.runs = runs;
        this.results = results;
        this.scorings = scorings;
        this.datasets = datasets;
        this.clock = clock;
    }

    public Scoring rescore(String runId, String requestedBy) {
        EvaluationRun run = runs.find(runId).orElseThrow(() -> new RunRejected(RunRejected.Code.UNKNOWN_RUN));
        LoadedDataset dataset;
        try {
            dataset = datasets.load(run.versions().datasetId(), run.versions().datasetVersion());
        }
        catch (RuntimeException exception) {
            throw new RunRejected(RunRejected.Code.UNKNOWN_DATASET);
        }
        if (!dataset.digest().equals(run.versions().datasetDigest())) {
            throw new RunRejected(RunRejected.Code.UNKNOWN_DATASET);
        }
        Map<String, CaseCall> calls = new HashMap<>();
        for (EvaluationCase evaluationCase : dataset.cases()) {
            evaluationCase.calls().forEach(call -> calls.put(evaluationCase.caseId() + "/" + call.order(), call));
        }
        List<CallResult> rescored = results.list(runId).stream().map(record -> {
            CaseCall call = calls.get(record.caseId() + "/" + record.order());
            if (record.failure() != null || call == null) {
                return record.toCallResult();
            }
            return CallResult.completed(record.kind(), record.stage(), scorer.score(call.expected(), record.observed()),
                record.attempts().size());
        }).toList();
        Scoring scoring = new Scoring(UUID.randomUUID().toString(), runId, RunService.SCORING_VERSION,
            dataset.digest(), requestedBy, clock.instant(), aggregator.aggregate(rescored));
        scorings.append(scoring);
        return scoring;
    }

    public List<Scoring> history(String runId) {
        return scorings.list(runId);
    }
}
