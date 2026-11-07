package com.careerform.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.monitoring.ModelCallRecording.Attempt;
import com.careerform.monitoring.ModelCallRecording.Outcome;

@DisplayName("평가 실행 범위의 모델 호출 기록")
class ModelCallRecordingTest {

    @Test
    @DisplayName("범위 밖의 모델 호출은 기록하지 않는다")
    void ignoresCallsOutsideScope() {
        List<Attempt> seen = new CopyOnWriteArrayList<>();
        ModelCallRecording.within(seen::add, () -> null);

        ModelCallRecording.record(attempt());

        assertThat(seen).isEmpty();
    }

    @Test
    @DisplayName("범위 안에서 만든 가상 스레드의 호출도 같은 범위에 기록한다")
    void recordsCallsFromVirtualThreadsStartedInScope() throws Exception {
        List<Attempt> seen = new CopyOnWriteArrayList<>();

        ModelCallRecording.within(seen::add, () -> {
            try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
                Future<?> first = executor.submit(() -> ModelCallRecording.record(attempt()));
                Future<?> second = executor.submit(() -> ModelCallRecording.record(attempt()));
                first.get();
                second.get();
            }
            catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
            return null;
        });

        assertThat(seen).hasSize(2);
    }

    @Test
    @DisplayName("범위가 끝난 뒤에는 범위 안에서 만든 스레드가 계속 살아 있어도 기록하지 않는다")
    void closedScopeStopsRecordingInInheritedThreads() throws Exception {
        List<Attempt> seen = new CopyOnWriteArrayList<>();
        ExecutorService pool = ModelCallRecording.within(seen::add, () -> {
            ExecutorService created = Executors.newSingleThreadExecutor();
            try {
                created.submit(() -> { }).get();
            }
            catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
            return created;
        });
        try {
            pool.submit(() -> ModelCallRecording.record(attempt())).get();
        }
        finally {
            pool.shutdownNow();
        }

        assertThat(seen).isEmpty();
    }

    @Test
    @DisplayName("기록기 오류는 모델 호출 흐름을 막지 않는다")
    void sinkFailureIsSwallowed() {
        String result = ModelCallRecording.within(attempt -> {
            throw new IllegalStateException("sink failed");
        }, () -> {
            ModelCallRecording.record(attempt());
            return "done";
        });

        assertThat(result).isEqualTo("done");
    }

    @Test
    @DisplayName("중첩 범위가 끝나면 바깥 범위로 돌아간다")
    void nestedScopeRestoresOuter() {
        List<Attempt> outer = new CopyOnWriteArrayList<>();
        List<Attempt> inner = new CopyOnWriteArrayList<>();

        ModelCallRecording.within(outer::add, () -> {
            ModelCallRecording.within(inner::add, () -> {
                ModelCallRecording.record(attempt());
                return null;
            });
            ModelCallRecording.record(attempt());
            return null;
        });

        assertThat(inner).hasSize(1);
        assertThat(outer).hasSize(1);
    }

    private static Attempt attempt() {
        return new Attempt("jev", "answer", 1_000L, 200, Outcome.SUCCESS, 3L, 1L, "jev-test");
    }
}
