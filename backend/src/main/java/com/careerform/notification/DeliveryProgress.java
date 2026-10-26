package com.careerform.notification;

import java.time.Instant;

/** 공고 하나의 발송 진행: 상태별 건수와 마지막 시도 시각. */
public record DeliveryProgress(long pending, long sending, long accepted, long abandoned, Instant lastAttemptAt) {
    public static DeliveryProgress empty() { return new DeliveryProgress(0, 0, 0, 0, null); }
}
