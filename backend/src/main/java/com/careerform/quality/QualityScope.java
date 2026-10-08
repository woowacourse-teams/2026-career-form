package com.careerform.quality;

import java.util.Optional;
import java.util.List;
import java.util.stream.Stream;
import java.util.concurrent.atomic.AtomicReference;

import com.careerform.formanalysis.application.port.AnalysisRouteObserver.Decision;

public final class QualityScope implements AutoCloseable {

    private static final ThreadLocal<QualityScope> CURRENT = new ThreadLocal<>();
    private final QualityScope previous;
    private final AtomicReference<Optional<Decision>> decision = new AtomicReference<>(Optional.empty());
    private final AtomicReference<List<QualityCollectionService.AiCall>> calls = new AtomicReference<>(List.of());
    private final long startedNanos = System.nanoTime();
    private Object request;
    private boolean observed;

    private QualityScope(QualityScope previous) {
        this.previous = previous;
    }

    public static QualityScope open() {
        var scope = new QualityScope(CURRENT.get());
        CURRENT.set(scope);
        return scope;
    }

    public static Optional<QualityScope> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    public static void record(Decision decision) {
        current().ifPresent(scope -> scope.decision.set(Optional.of(decision)));
    }

    public Optional<Decision> decision() {
        return decision.get();
    }

    public void request(Object body) { request = body; }

    public Object request() { return request; }

    public long durationMs() { return Math.max(0, (System.nanoTime() - startedNanos) / 1_000_000); }

    public void call(QualityCollectionService.AiCall call) {
        calls.updateAndGet(previous -> previous.size() < 200 ? Stream.concat(previous.stream(), Stream.of(call)).toList() : previous);
    }

    public List<QualityCollectionService.AiCall> calls() { return calls.get(); }

    public boolean observed() { return observed; }

    public void observed(boolean value) { observed = value; }

    @Override
    public void close() {
        if (CURRENT.get() != this) {
            throw new IllegalStateException("품질 관측 범위의 종료 순서가 맞지 않습니다");
        }
        if (previous == null) {
            CURRENT.remove();
        } else {
            CURRENT.set(previous);
        }
    }
}
