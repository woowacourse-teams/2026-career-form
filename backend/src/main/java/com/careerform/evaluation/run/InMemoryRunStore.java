package com.careerform.evaluation.run;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import com.careerform.evaluation.prompt.PromptSnapshot;

/** 테스트와 로컬 확인용 저장소. 모든 연산을 하나의 잠금으로 직렬화한다. */
public final class InMemoryRunStore implements RunStore {

    private final Map<String, EvaluationRun> runs = new LinkedHashMap<>();
    private final Map<String, PromptSnapshot> snapshots = new LinkedHashMap<>();

    @Override
    public synchronized Registration register(EvaluationRun run) {
        Optional<EvaluationRun> active = runs.values().stream().filter(existing -> existing.status().active()).findFirst();
        if (active.isPresent()) {
            return new Registration(null, active.get());
        }
        runs.put(run.id(), run);
        return new Registration(run, null);
    }

    @Override
    public synchronized Optional<EvaluationRun> find(String runId) {
        return Optional.ofNullable(runs.get(runId));
    }

    @Override
    public synchronized boolean transition(String runId, RunStatus from, RunStatus to, Instant at) {
        EvaluationRun run = runs.get(runId);
        if (run == null || run.status() != from || !from.canMoveTo(to)) {
            return false;
        }
        runs.put(runId, run.moved(to, at));
        return true;
    }

    @Override
    public synchronized boolean requestCancel(String runId) {
        EvaluationRun run = runs.get(runId);
        if (run == null || run.status() != RunStatus.RUNNING) {
            return false;
        }
        runs.put(runId, run.cancellationRequested());
        return true;
    }

    @Override
    public synchronized void savePromptSnapshotIfAbsent(PromptSnapshot snapshot) {
        snapshots.putIfAbsent(snapshot.digest(), snapshot);
    }

    @Override
    public synchronized Optional<PromptSnapshot> findPromptSnapshot(String digest) {
        return Optional.ofNullable(snapshots.get(digest));
    }

    synchronized List<EvaluationRun> all() {
        return List.copyOf(runs.values());
    }
}
