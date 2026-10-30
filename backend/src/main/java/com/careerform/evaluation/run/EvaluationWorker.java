package com.careerform.evaluation.run;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.careerform.evaluation.dataset.CaseCall;
import com.careerform.evaluation.dataset.DatasetLoader;
import com.careerform.evaluation.dataset.DatasetRejected;
import com.careerform.evaluation.dataset.EvaluationCase;
import com.careerform.evaluation.dataset.LoadedDataset;
import com.careerform.evaluation.prompt.PromptCatalog;
import com.careerform.formanalysis.application.PromptSource;

/**
 * 진행 중 실행 하나를 임대로 가져와 사례의 호출을 반복마다 기록 순서대로 실행한다. 호출마다 결과를 추가
 * 저장하고 임대를 늘린다. 이어받은 실행은 결과가 있는 호출을 건너뛴다. 호출 경계마다 취소와 예산을 확인한다.
 */
public final class EvaluationWorker {

    private static final Logger log = LoggerFactory.getLogger(EvaluationWorker.class);

    private final RunStore runs;
    private final ResultStore results;
    private final DatasetLoader datasets;
    private final CallExecutor executor;
    private final PromptCatalog prompts;
    private final List<? extends PromptSource> promptSources;
    private final int maxModelCallsPerRun;
    private final Clock clock;
    private final String owner;
    private final Duration lease;

    public EvaluationWorker(RunStore runs, ResultStore results, DatasetLoader datasets, CallExecutor executor,
        PromptCatalog prompts, List<? extends PromptSource> promptSources, int maxModelCallsPerRun, Clock clock,
        String owner, Duration lease) {
        this.runs = runs;
        this.results = results;
        this.datasets = datasets;
        this.executor = executor;
        this.prompts = prompts;
        this.promptSources = List.copyOf(promptSources);
        this.maxModelCallsPerRun = maxModelCallsPerRun;
        this.clock = clock;
        this.owner = owner;
        this.lease = lease;
    }

    /** 처리할 실행이 있으면 끝까지 처리하고 true, 없으면 false. */
    public boolean runOnce() {
        Optional<EvaluationRun> claimed = runs.claim(owner, clock.instant(), lease);
        if (claimed.isEmpty()) {
            return false;
        }
        EvaluationRun run = claimed.get();
        try {
            process(run);
        }
        catch (RuntimeException exception) {
            log.warn("EVALUATION_RUN_FAILED runId={} reason={}", run.id(), exception.getClass().getSimpleName());
            runs.finish(run.id(), owner, RunStatus.FAILED, clock.instant());
        }
        return true;
    }

    private void process(EvaluationRun run) {
        RunVersions versions = run.versions();
        LoadedDataset dataset;
        try {
            dataset = datasets.load(versions.datasetId(), versions.datasetVersion());
        }
        catch (DatasetRejected rejected) {
            fail(run, "DATASET_REJECTED");
            return;
        }
        if (!dataset.digest().equals(versions.datasetDigest())
            || !prompts.snapshot(promptSources).digest().equals(versions.promptDigest())) {
            fail(run, "VERSION_MISMATCH");
            return;
        }
        List<CallResultRecord> stored = results.list(run.id());
        Set<String> done = stored.stream().map(CallResultRecord::key).collect(Collectors.toSet());
        int usedModelCalls = stored.stream().mapToInt(record -> record.attempts().size()).sum();
        int processed = stored.size();
        for (int repetition = 1; repetition <= run.repetitions(); repetition++) {
            for (EvaluationCase evaluationCase : dataset.casesIn(versions.split())) {
                for (CaseCall call : evaluationCase.calls()) {
                    String key = CallResultRecord.key(repetition, evaluationCase.caseId(), call.order());
                    if (done.contains(key)) {
                        continue;
                    }
                    if (runs.find(run.id()).map(EvaluationRun::cancelRequested).orElse(true)) {
                        runs.finish(run.id(), owner, RunStatus.CANCELLED, clock.instant());
                        return;
                    }
                    if (usedModelCalls >= maxModelCallsPerRun) {
                        log.warn("EVALUATION_RUN_BUDGET_REACHED runId={} modelCalls={}", run.id(), usedModelCalls);
                        runs.finish(run.id(), owner, RunStatus.PARTIAL, clock.instant());
                        return;
                    }
                    ExecutedCall executed = executor.execute(call, versions.settings());
                    results.append(CallResultRecord.of(run.id(), repetition, evaluationCase.caseId(), call.order(),
                        executed, clock.instant()));
                    usedModelCalls += executed.attempts().size();
                    processed++;
                    if (!runs.renew(run.id(), owner, clock.instant().plus(lease), processed)) {
                        log.warn("EVALUATION_RUN_LEASE_LOST runId={}", run.id());
                        return;
                    }
                }
            }
        }
        boolean anyFailed = results.list(run.id()).stream()
            .anyMatch(record -> record.toCallResult().effectiveFailure() != null);
        runs.finish(run.id(), owner, anyFailed ? RunStatus.PARTIAL : RunStatus.COMPLETED, clock.instant());
    }

    private void fail(EvaluationRun run, String reason) {
        log.warn("EVALUATION_RUN_NOT_STARTED runId={} reason={}", run.id(), reason);
        runs.finish(run.id(), owner, RunStatus.FAILED, clock.instant());
    }
}
