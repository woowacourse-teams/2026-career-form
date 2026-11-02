package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.prompt.PromptSnapshot;

/** 메모리와 Mongo 실행 저장소가 함께 지키는 저장 계약. */
abstract class RunStoreContract {

    private static final Instant AT = Instant.parse("2026-10-30T03:00:00Z");

    protected abstract RunStore store();

    @Test
    @DisplayName("진행 중 실행은 하나뿐이며 끝난 뒤에는 새 실행을 받는다")
    void singleActiveRun() {
        RunStore store = store();
        EvaluationRun first = run("run-1", "fp");

        assertThat(store.register(first)).isEqualTo(new RunStore.Registration(first, null));
        RunStore.Registration rejected = store.register(run("run-2", "fp"));
        assertThat(rejected.registered()).isNull();
        assertThat(rejected.activeRun().id()).isEqualTo("run-1");

        assertThat(store.transition("run-1", RunStatus.QUEUED, RunStatus.CANCELLED, AT)).isTrue();
        assertThat(store.register(run("run-3", "fp")).registered()).isNotNull();
    }

    @Test
    @DisplayName("상태 전환은 기대한 이전 상태일 때만 일어나고 시작·종료 시각을 남긴다")
    void transitionIsCompareAndSet() {
        RunStore store = store();
        store.register(run("run-1", "fp"));

        assertThat(store.transition("run-1", RunStatus.RUNNING, RunStatus.COMPLETED, AT)).isFalse();
        assertThat(store.transition("run-1", RunStatus.QUEUED, RunStatus.RUNNING, AT)).isTrue();
        assertThat(store.transition("run-1", RunStatus.QUEUED, RunStatus.RUNNING, AT)).isFalse();
        assertThat(store.transition("run-1", RunStatus.RUNNING, RunStatus.PARTIAL, AT.plusSeconds(5))).isTrue();

        EvaluationRun done = store.find("run-1").orElseThrow();
        assertThat(done.status()).isEqualTo(RunStatus.PARTIAL);
        assertThat(done.startedAt()).isEqualTo(AT);
        assertThat(done.finishedAt()).isEqualTo(AT.plusSeconds(5));
        assertThat(store.transition("missing", RunStatus.QUEUED, RunStatus.RUNNING, AT)).isFalse();
    }

    @Test
    @DisplayName("취소 요청은 실행 중인 실행에만 표시된다")
    void cancelRequestOnlyWhileRunning() {
        RunStore store = store();
        store.register(run("run-1", "fp"));

        assertThat(store.requestCancel("run-1")).isFalse();
        store.transition("run-1", RunStatus.QUEUED, RunStatus.RUNNING, AT);
        assertThat(store.requestCancel("run-1")).isTrue();
        assertThat(store.find("run-1").orElseThrow().cancelRequested()).isTrue();
    }

    @Test
    @DisplayName("삭제는 끝난 실행만 지우고 끝나지 않은 실행은 남긴다")
    void deletesOnlyFinishedRuns() {
        RunStore store = store();
        store.register(run("run-1", "fp"));
        store.transition("run-1", RunStatus.QUEUED, RunStatus.CANCELLED, AT);
        store.register(run("run-2", "fp"));

        assertThat(store.deleteFinished(List.of("run-1", "run-2", "missing"))).isEqualTo(1);
        assertThat(store.find("run-1")).isEmpty();
        assertThat(store.find("run-2")).isPresent();
    }

    @Test
    @DisplayName("최근 실행을 등록 시각 역순으로 돌려준다")
    void recentRunsNewestFirst() {
        RunStore store = store();
        store.register(run("run-1", "fp"));
        store.transition("run-1", RunStatus.QUEUED, RunStatus.CANCELLED, AT);
        EvaluationRun later = run("run-2", "fp");
        store.register(new EvaluationRun(later.id(), later.fingerprint(), later.versions(), 2, 6, 20, "tester",
            AT.plusSeconds(60), RunStatus.QUEUED, null, null, 0, false, null, null, null));

        assertThat(store.recent(10)).extracting(EvaluationRun::id).containsExactly("run-2", "run-1");
        assertThat(store.recent(1)).hasSize(1);
    }

    @Test
    @DisplayName("작업자는 대기 중 실행을 임대로 가져가고, 임대가 살아 있으면 다른 작업자는 가져가지 못한다")
    void claimLeasesQueuedRun() {
        RunStore store = store();
        store.register(run("run-1", "fp"));

        EvaluationRun claimed = store.claim("worker-a", AT, java.time.Duration.ofMinutes(1)).orElseThrow();
        assertThat(claimed.status()).isEqualTo(RunStatus.RUNNING);
        assertThat(claimed.leaseOwner()).isEqualTo("worker-a");
        assertThat(claimed.startedAt()).isEqualTo(AT);
        assertThat(store.claim("worker-b", AT.plusSeconds(30), java.time.Duration.ofMinutes(1))).isEmpty();
    }

    @Test
    @DisplayName("임대가 끝난 실행 중 실행은 다른 작업자가 이어받고 시작 시각은 유지된다")
    void expiredLeaseIsTakenOver() {
        RunStore store = store();
        store.register(run("run-1", "fp"));
        store.claim("worker-a", AT, java.time.Duration.ofMinutes(1));

        EvaluationRun taken = store.claim("worker-b", AT.plusSeconds(61), java.time.Duration.ofMinutes(1)).orElseThrow();

        assertThat(taken.leaseOwner()).isEqualTo("worker-b");
        assertThat(taken.startedAt()).isEqualTo(AT);
        assertThat(store.renew("run-1", "worker-a", AT.plusSeconds(120), 3)).isFalse();
        assertThat(store.renew("run-1", "worker-b", AT.plusSeconds(120), 3)).isTrue();
        assertThat(store.find("run-1").orElseThrow().processedCalls()).isEqualTo(3);
    }

    @Test
    @DisplayName("종료는 임대를 가진 작업자만 할 수 있고 끝난 뒤에는 새 실행을 받는다")
    void finishRequiresLeaseOwner() {
        RunStore store = store();
        store.register(run("run-1", "fp"));
        store.claim("worker-a", AT, java.time.Duration.ofMinutes(1));

        assertThat(store.finish("run-1", "worker-b", RunStatus.COMPLETED, AT.plusSeconds(5))).isFalse();
        assertThat(store.finish("run-1", "worker-a", RunStatus.QUEUED, AT.plusSeconds(5))).isFalse();
        assertThat(store.finish("run-1", "worker-a", RunStatus.PARTIAL, AT.plusSeconds(5))).isTrue();
        EvaluationRun done = store.find("run-1").orElseThrow();
        assertThat(done.status()).isEqualTo(RunStatus.PARTIAL);
        assertThat(done.finishedAt()).isEqualTo(AT.plusSeconds(5));
        assertThat(done.leaseOwner()).isNull();
        assertThat(store.register(run("run-2", "fp")).registered()).isNotNull();
    }

    @Test
    @DisplayName("프롬프트 스냅샷은 처음 본 해시만 저장하고 이후 같은 해시는 덮어쓰지 않는다")
    void promptSnapshotIsWriteOnce() {
        RunStore store = store();
        store.savePromptSnapshotIfAbsent(new PromptSnapshot("d1", new TreeMap<>(Map.of("a/x", "first"))));
        store.savePromptSnapshotIfAbsent(new PromptSnapshot("d1", new TreeMap<>(Map.of("a/x", "changed"))));

        assertThat(store.findPromptSnapshot("d1").orElseThrow().parts()).containsEntry("a/x", "first");
        assertThat(store.findPromptSnapshot("d2")).isEmpty();
    }

    @Test
    @DisplayName("비교 실행은 첫 실행만 QUEUED, 나머지는 WAITING으로 함께 등록하고, 진행 중이거나 대기 중인 비교가 있으면 거부한다")
    void registersComparisonWithOneQueuedRun() {
        RunStore store = store();
        List<EvaluationRun> comparison = List.of(run("run-1", "fp-a", "cmp-1"), run("run-2", "fp-b", "cmp-1"),
            run("run-3", "fp-c", "cmp-1"));

        RunStore.Registration registration = store.registerComparison(comparison);

        assertThat(registration.registered().id()).isEqualTo("run-1");
        assertThat(store.find("run-1").orElseThrow().status()).isEqualTo(RunStatus.QUEUED);
        assertThat(store.find("run-2").orElseThrow().status()).isEqualTo(RunStatus.WAITING);
        assertThat(store.find("run-3").orElseThrow().comparisonId()).isEqualTo("cmp-1");
        assertThat(store.comparison("cmp-1")).extracting(EvaluationRun::id).containsExactly("run-1", "run-2", "run-3");
        assertThat(store.registerComparison(List.of(run("run-4", "fp-d", "cmp-2"))).activeRun().id()).isEqualTo("run-1");
        store.transition("run-1", RunStatus.QUEUED, RunStatus.CANCELLED, AT);
        assertThat(store.register(run("run-5", "fp-e")).activeRun().id())
            .as("대기 중인 비교 실행이 남아 있으면 새 실행을 받지 않는다").isEqualTo("run-2");
    }

    @Test
    @DisplayName("진행 중 실행이 없을 때만 가장 먼저 등록된 WAITING 실행 하나를 QUEUED로 올린다")
    void promotesOldestWaitingRunWhenIdle() {
        RunStore store = store();
        store.registerComparison(List.of(run("run-1", "fp-a", "cmp-1"), run("run-2", "fp-b", "cmp-1"),
            run("run-3", "fp-c", "cmp-1")));

        assertThat(store.promoteWaiting()).isFalse();
        store.claim("worker", AT, java.time.Duration.ofMinutes(1));
        store.finish("run-1", "worker", RunStatus.COMPLETED, AT.plusSeconds(5));

        assertThat(store.promoteWaiting()).isTrue();
        assertThat(store.find("run-2").orElseThrow().status()).isEqualTo(RunStatus.QUEUED);
        assertThat(store.find("run-3").orElseThrow().status()).isEqualTo(RunStatus.WAITING);
        assertThat(store.promoteWaiting()).isFalse();
        assertThat(store.claim("worker", AT.plusSeconds(6), java.time.Duration.ofMinutes(1))).get()
            .extracting(EvaluationRun::id).isEqualTo("run-2");
    }

    @Test
    @DisplayName("WAITING 실행은 작업자가 가져가지 않고 바로 취소할 수 있다")
    void waitingRunIsNotClaimedAndCanBeCancelled() {
        RunStore store = store();
        store.registerComparison(List.of(run("run-1", "fp-a", "cmp-1"), run("run-2", "fp-b", "cmp-1")));
        store.transition("run-1", RunStatus.QUEUED, RunStatus.CANCELLED, AT);

        assertThat(store.claim("worker", AT, java.time.Duration.ofMinutes(1))).isEmpty();
        assertThat(store.transition("run-2", RunStatus.WAITING, RunStatus.CANCELLED, AT)).isTrue();
        assertThat(store.promoteWaiting()).isFalse();
        assertThat(store.register(run("run-3", "fp")).registered()).isNotNull();
    }

    @Test
    @DisplayName("저장한 실행의 버전과 계획 값을 그대로 읽는다")
    void roundTripsRun() {
        RunStore store = store();
        EvaluationRun run = run("run-1", "fp");
        store.register(run);

        assertThat(store.find("run-1")).contains(run);
    }

    static EvaluationRun run(String id, String fingerprint, String comparisonId) {
        return run(id, fingerprint).inComparison(comparisonId);
    }

    static EvaluationRun run(String id, String fingerprint) {
        RunVersions versions = new RunVersions("generic-matching", 1, "dataset-digest", "tuning", "prompt-digest",
            "v1", "image@sha256:abc", "jev", "jev-latest", "scoring-v1",
            new TreeMap<>(Map.of("field-batch-size", "5")));
        return EvaluationRun.queued(id, fingerprint, versions, 2, 6, 20, "tester", AT);
    }
}
