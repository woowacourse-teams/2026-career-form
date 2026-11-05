package com.careerform.notification;

/** 기간 안(예정 시각 기준) 발송의 상태별 건수, 시도 합, 수락 발송의 예정→수락 지연 백분위(밀리초, 수락이 없으면 null). */
public record DeliverySummary(long pending, long sending, long accepted, long abandoned, long attempts, Long latencyP50Millis, Long latencyP95Millis) {
    public long total() { return pending + sending + accepted + abandoned; }
}
