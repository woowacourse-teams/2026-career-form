package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
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
    @DisplayName("프롬프트 스냅샷은 처음 본 해시만 저장하고 이후 같은 해시는 덮어쓰지 않는다")
    void promptSnapshotIsWriteOnce() {
        RunStore store = store();
        store.savePromptSnapshotIfAbsent(new PromptSnapshot("d1", new TreeMap<>(Map.of("a/x", "first"))));
        store.savePromptSnapshotIfAbsent(new PromptSnapshot("d1", new TreeMap<>(Map.of("a/x", "changed"))));

        assertThat(store.findPromptSnapshot("d1").orElseThrow().parts()).containsEntry("a/x", "first");
        assertThat(store.findPromptSnapshot("d2")).isEmpty();
    }

    @Test
    @DisplayName("저장한 실행의 버전과 계획 값을 그대로 읽는다")
    void roundTripsRun() {
        RunStore store = store();
        EvaluationRun run = run("run-1", "fp");
        store.register(run);

        assertThat(store.find("run-1")).contains(run);
    }

    static EvaluationRun run(String id, String fingerprint) {
        RunVersions versions = new RunVersions("generic-matching", 1, "dataset-digest", "tuning", "prompt-digest",
            "v1", "image@sha256:abc", "jev", "jev-latest", "scoring-v1",
            new TreeMap<>(Map.of("field-batch-size", "5")));
        return EvaluationRun.queued(id, fingerprint, versions, 2, 6, 20, "tester", AT);
    }
}
