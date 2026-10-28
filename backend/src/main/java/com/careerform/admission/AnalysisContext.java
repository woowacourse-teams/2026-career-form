package com.careerform.admission;

import java.time.Duration;

public record AnalysisContext(String installationId, long deadlineNanos) {
    private static final InheritableThreadLocal<AnalysisContext> CURRENT = new InheritableThreadLocal<>();
    static AnalysisContext currentOrNull() { return CURRENT.get(); }
    public static AnalysisContext current() {
        var context = CURRENT.get();
        if (context == null) throw new AdmissionFailure("INVALID_INSTALLATION", 401, null);
        context.check();
        return context;
    }
    public static void begin(String installationId, Duration timeout) { CURRENT.set(new AnalysisContext(installationId, System.nanoTime() + timeout.toNanos())); }
    public static void clear() { CURRENT.remove(); }
    public void check() {
        if (Thread.currentThread().isInterrupted() || deadlineNanos - System.nanoTime() <= 0) {
            throw new AdmissionFailure("ANALYSIS_DEADLINE", 503, null);
        }
    }
    public long timeoutMillis(long configured) {
        check();
        return Math.max(1, Math.min(configured, (deadlineNanos - System.nanoTime()) / 1_000_000));
    }
    @Override public String toString() { return "AnalysisContext[redacted]"; }
}
