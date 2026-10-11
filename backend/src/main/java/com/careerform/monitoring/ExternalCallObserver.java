package com.careerform.monitoring;

@FunctionalInterface
public interface ExternalCallObserver {
    void recorded(String provider, String operation, String outcome, long durationMs);

    record Context(boolean called, String modelVersion) {
    }

    default void recorded(String provider, String operation, String outcome, long durationMs, Context context) {
        if (context.called()) { recorded(provider, operation, outcome, durationMs); }
    }
}
