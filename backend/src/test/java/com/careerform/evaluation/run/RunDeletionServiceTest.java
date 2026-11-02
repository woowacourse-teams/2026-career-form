package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("평가 기록 삭제")
class RunDeletionServiceTest {

    private static final Instant AT = Instant.parse("2026-11-02T03:00:00Z");
    private final InMemoryRunStore runs = new InMemoryRunStore();
    private final InMemoryResultStore results = new InMemoryResultStore();
    private final InMemoryScoringStore scorings = new InMemoryScoringStore();
    private final RunDeletionService service = new RunDeletionService(runs, results, scorings);

    @Test
    @DisplayName("비교 묶음을 지우면 묶음의 실행·호출 결과·재채점 기록이 모두 지워지고 다른 실행은 남는다")
    void deletesComparison() {
        runs.registerComparison(List.of(RunStoreContract.run("a", "fp", "cmp"), RunStoreContract.run("b", "fp", "cmp")));
        runs.transition("a", RunStatus.QUEUED, RunStatus.CANCELLED, AT);
        runs.transition("b", RunStatus.WAITING, RunStatus.CANCELLED, AT);
        runs.register(RunStoreContract.run("c", "fp"));
        runs.transition("c", RunStatus.QUEUED, RunStatus.CANCELLED, AT);
        results.append(ResultStoreContract.scored("a", 1, 1));
        results.append(ResultStoreContract.scored("b", 1, 1));
        results.append(ResultStoreContract.scored("c", 1, 1));
        scorings.append(new Scoring("s", "a", "v", "d", "tester", AT, null));

        RunDeletionService.Deleted deleted = service.delete("cmp", "tester");

        assertThat(deleted).isEqualTo(new RunDeletionService.Deleted(List.of("a", "b"), 2));
        assertThat(runs.find("a")).isEmpty();
        assertThat(runs.find("b")).isEmpty();
        assertThat(results.list("a")).isEmpty();
        assertThat(scorings.list("a")).isEmpty();
        assertThat(runs.find("c")).isPresent();
        assertThat(results.list("c")).hasSize(1);
    }

    @Test
    @DisplayName("단독 실행은 실행 ID로 지운다")
    void deletesSingleRun() {
        runs.register(RunStoreContract.run("c", "fp"));
        runs.transition("c", RunStatus.QUEUED, RunStatus.RUNNING, AT);
        runs.transition("c", RunStatus.RUNNING, RunStatus.COMPLETED, AT);

        assertThat(service.delete("c", "tester").runIds()).containsExactly("c");
        assertThat(runs.find("c")).isEmpty();
    }

    @Test
    @DisplayName("끝나지 않은 실행이 하나라도 있으면 아무것도 지우지 않고, 없는 기록이면 알 수 없는 실행이다")
    void rejectsPendingAndUnknown() {
        runs.registerComparison(List.of(RunStoreContract.run("a", "fp", "cmp"), RunStoreContract.run("b", "fp", "cmp")));
        runs.transition("a", RunStatus.QUEUED, RunStatus.CANCELLED, AT);
        results.append(ResultStoreContract.scored("a", 1, 1));

        assertThatThrownBy(() -> service.delete("cmp", "tester")).isInstanceOfSatisfying(RunRejected.class,
            rejected -> {
                assertThat(rejected.code()).isEqualTo(RunRejected.Code.RUN_ACTIVE);
                assertThat(rejected.activeRunId()).isEqualTo("b");
            });
        assertThat(runs.find("a")).isPresent();
        assertThat(results.list("a")).hasSize(1);
        assertThatThrownBy(() -> service.delete("missing", "tester")).isInstanceOfSatisfying(RunRejected.class,
            rejected -> assertThat(rejected.code()).isEqualTo(RunRejected.Code.UNKNOWN_RUN));
    }
}
