package com.careerform.evaluation.run;

import java.util.EnumSet;
import java.util.Set;

/**
 * 평가 실행 상태. QUEUED → RUNNING → COMPLETED | PARTIAL | FAILED | CANCELLED, 대기 중 취소는 QUEUED → CANCELLED.
 * 비교 실행의 두 번째 이후 실행은 WAITING으로 등록되고, 진행 중 실행이 없을 때 하나씩 QUEUED로 올라간다.
 */
public enum RunStatus {
    WAITING,
    QUEUED,
    RUNNING,
    COMPLETED,
    PARTIAL,
    FAILED,
    CANCELLED;

    /** 작업자가 처리 중이거나 처리할 실행. 저장소 전체에서 하나뿐이다. */
    public boolean active() {
        return this == QUEUED || this == RUNNING;
    }

    /** 아직 끝나지 않은 실행(WAITING 포함). 남아 있으면 새 실행을 받지 않는다. */
    public boolean pending() {
        return this == WAITING || active();
    }

    public boolean canMoveTo(RunStatus next) {
        return allowedNext().contains(next);
    }

    private Set<RunStatus> allowedNext() {
        return switch (this) {
            case WAITING -> EnumSet.of(QUEUED, CANCELLED);
            case QUEUED -> EnumSet.of(RUNNING, CANCELLED);
            case RUNNING -> EnumSet.of(COMPLETED, PARTIAL, FAILED, CANCELLED);
            default -> EnumSet.noneOf(RunStatus.class);
        };
    }
}
