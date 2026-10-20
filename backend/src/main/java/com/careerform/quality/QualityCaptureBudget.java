package com.careerform.quality;

public final class QualityCaptureBudget {
    private final long limit;
    private long bytes = 4096;

    public QualityCaptureBudget(long limit) { this.limit = limit; }

    public void retain(long amount) {
        if (amount < 0 || amount > limit - bytes) { throw new QualityAdmissionException(413); }
        bytes += amount;
    }

    public String text(String value, int max) {
        if (value == null) { return null; }
        if (value.length() > max) { throw new QualityAdmissionException(413); }
        retain(128L + 16L * value.length());
        return value;
    }

    public java.util.List<QualityCollectionService.AiCall> calls(java.util.List<QualityCollectionService.AiCall> calls) {
        if (calls.size() > 200) { throw new QualityAdmissionException(413); }
        return calls.stream().map(call -> {
            retain(256);
            return new QualityCollectionService.AiCall(text(call.provider(), 128), text(call.operation(), 128),
                text(call.outcome(), 128), call.durationMs(), text(call.modelVersion(), 256));
        }).toList();
    }

    public long bytes() { return bytes; }
}
