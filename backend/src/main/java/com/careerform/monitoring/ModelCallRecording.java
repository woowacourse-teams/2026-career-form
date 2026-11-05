package com.careerform.monitoring;

import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 모델 HTTP 시도마다 시간, 상태, 관측 토큰을 실행 범위의 기록기로 넘긴다.
 * 범위는 평가 실행이 연 스레드와 그 안에서 만든 스레드(가상 스레드 포함)에만 적용된다.
 * 범위 밖의 제품 요청은 아무것도 기록하지 않으며, 범위가 끝나면 상속받은 스레드도 기록을 멈춘다.
 * 요청과 응답 본문은 다루지 않는다.
 */
public final class ModelCallRecording {

    private static final Logger log = LoggerFactory.getLogger(ModelCallRecording.class);
    private static final InheritableThreadLocal<Scope> CURRENT = new InheritableThreadLocal<>();

    private ModelCallRecording() {
    }

    public enum Outcome {
        SUCCESS,
        HTTP_ERROR,
        /** 입력 토큰 한도를 넘어 공급자가 거절했다. 범용 로직이 질문을 나눠 다시 묻는다. */
        TOKEN_LIMIT,
        TIMEOUT,
        NETWORK_ERROR,
        INVALID_RESPONSE
    }

    /** 토큰과 모델명은 공급자가 알려 주지 않으면 null이다. 0으로 채우지 않는다. */
    public record Attempt(
        String provider,
        String operation,
        long durationNanos,
        Integer httpStatus,
        Outcome outcome,
        Long inputTokens,
        Long outputTokens,
        String observedModel
    ) {
    }

    @FunctionalInterface
    public interface Sink {
        void recorded(Attempt attempt);
    }

    @FunctionalInterface
    public interface Work<T, E extends Exception> {
        T run() throws E;
    }

    public static <T, E extends Exception> T within(Sink sink, Work<T, E> work) throws E {
        Scope previous = CURRENT.get();
        Scope scope = new Scope(sink);
        CURRENT.set(scope);
        try {
            return work.run();
        }
        finally {
            scope.open.set(false);
            if (previous == null) {
                CURRENT.remove();
            }
            else {
                CURRENT.set(previous);
            }
        }
    }

    public static void record(Attempt attempt) {
        Scope scope = CURRENT.get();
        if (scope == null || !scope.open.get()) {
            return;
        }
        try {
            scope.sink.recorded(attempt);
        }
        catch (RuntimeException exception) {
            log.warn("MODEL_CALL_RECORDING_DROPPED reason={}", exception.getClass().getSimpleName());
        }
    }

    private static final class Scope {
        private final Sink sink;
        private final AtomicBoolean open = new AtomicBoolean(true);

        private Scope(Sink sink) {
            this.sink = sink;
        }
    }
}
