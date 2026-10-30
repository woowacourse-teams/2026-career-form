package com.careerform.evaluation.run;

import java.util.EnumSet;
import java.util.Set;

/** 평가 실행 상태. QUEUED → RUNNING → COMPLETED | PARTIAL | FAILED | CANCELLED, 대기 중 취소는 QUEUED → CANCELLED. */
public enum RunStatus {
    QUEUED,
    RUNNING,
    COMPLETED,
    PARTIAL,
    FAILED,
    CANCELLED;

    public boolean active() {
        return this == QUEUED || this == RUNNING;
    }

    public boolean canMoveTo(RunStatus next) {
        return allowedNext().contains(next);
    }

    private Set<RunStatus> allowedNext() {
        return switch (this) {
            case QUEUED -> EnumSet.of(RUNNING, CANCELLED);
            case RUNNING -> EnumSet.of(COMPLETED, PARTIAL, FAILED, CANCELLED);
            default -> EnumSet.noneOf(RunStatus.class);
        };
    }
}
