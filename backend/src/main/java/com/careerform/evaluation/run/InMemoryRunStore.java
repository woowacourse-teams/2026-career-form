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
        Optional<EvaluationRun> pending = pending();
        if (pending.isPresent()) {
            return new Registration(null, pending.get());
        }
        runs.put(run.id(), run);
        return new Registration(run, null);
    }

    @Override
    public synchronized Registration registerComparison(List<EvaluationRun> comparison) {
        Optional<EvaluationRun> pending = pending();
        if (pending.isPresent()) {
            return new Registration(null, pending.get());
        }
        for (int index = 0; index < comparison.size(); index++) {
            EvaluationRun run = comparison.get(index);
            runs.put(run.id(), index == 0 ? run : run.waiting());
        }
        return new Registration(runs.get(comparison.getFirst().id()), null);
    }

    @Override
    public synchronized List<EvaluationRun> comparison(String comparisonId) {
        return runs.values().stream().filter(run -> comparisonId.equals(run.comparisonId())).toList();
    }

    @Override
    public synchronized boolean promoteWaiting() {
        if (runs.values().stream().anyMatch(run -> run.status().active())) {
            return false;
        }
        Optional<EvaluationRun> next = runs.values().stream().filter(run -> run.status() == RunStatus.WAITING)
            .findFirst();
        next.ifPresent(run -> runs.put(run.id(), run.moved(RunStatus.QUEUED, null)));
        return next.isPresent();
    }

    /** 진행 중 실행을 먼저, 없으면 가장 먼저 등록된 WAITING 실행. */
    private Optional<EvaluationRun> pending() {
        return runs.values().stream().filter(run -> run.status().active()).findFirst()
            .or(() -> runs.values().stream().filter(run -> run.status() == RunStatus.WAITING).findFirst());
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

    @Override
    public synchronized List<EvaluationRun> recent(int limit) {
        List<EvaluationRun> all = new java.util.ArrayList<>(runs.values());
        java.util.Collections.reverse(all);
        return all.stream().limit(Math.max(0, limit)).toList();
    }

    @Override
    public synchronized Optional<EvaluationRun> claim(String owner, Instant now, java.time.Duration lease) {
        Optional<EvaluationRun> claimable = runs.values().stream()
            .filter(run -> run.status() == RunStatus.QUEUED
                || run.status() == RunStatus.RUNNING && run.leaseExpired(now))
            .findFirst();
        claimable.ifPresent(run -> runs.put(run.id(), run.leased(owner, now, now.plus(lease))));
        return claimable.map(run -> runs.get(run.id()));
    }

    @Override
    public synchronized boolean renew(String runId, String owner, Instant until, int processedCalls) {
        EvaluationRun run = runs.get(runId);
        if (run == null || run.status() != RunStatus.RUNNING || !owner.equals(run.leaseOwner())) {
            return false;
        }
        runs.put(runId, run.progressed(until, processedCalls));
        return true;
    }

    @Override
    public synchronized boolean finish(String runId, String owner, RunStatus to, Instant at) {
        EvaluationRun run = runs.get(runId);
        if (run == null || run.status() != RunStatus.RUNNING || !owner.equals(run.leaseOwner())
            || !RunStatus.RUNNING.canMoveTo(to)) {
            return false;
        }
        runs.put(runId, run.moved(to, at));
        return true;
    }

    synchronized List<EvaluationRun> all() {
        return List.copyOf(runs.values());
    }
}
