package com.careerform.evaluation.run;

/** 실행 등록이나 취소를 받을 수 없는 이유. 진행 중 실행 때문이면 그 실행 ID를 함께 준다. */
public final class RunRejected extends RuntimeException {

    public enum Code {
        UNKNOWN_DATASET,
        UNKNOWN_SPLIT,
        INVALID_REPETITIONS,
        INVALID_OVERRIDE,
        UNKNOWN_PROVIDER,
        UNKNOWN_MODEL,
        INVALID_PROMPT_VERSION,
        BUDGET_EXCEEDED,
        RUN_ACTIVE,
        UNKNOWN_RUN
    }

    private final Code code;
    private final String activeRunId;
    private final boolean sameFingerprint;

    RunRejected(Code code) {
        this(code, null, false);
    }

    RunRejected(Code code, String activeRunId, boolean sameFingerprint) {
        super(code.name(), null, false, false);
        this.code = code;
        this.activeRunId = activeRunId;
        this.sameFingerprint = sameFingerprint;
    }

    public Code code() {
        return code;
    }

    public String activeRunId() {
        return activeRunId;
    }

    public boolean sameFingerprint() {
        return sameFingerprint;
    }
}
