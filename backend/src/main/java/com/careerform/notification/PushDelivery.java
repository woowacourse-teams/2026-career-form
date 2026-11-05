package com.careerform.notification;

import java.time.Instant;
import java.util.Objects;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/** 공고 × 구독 한 쌍의 발송 상태. 재시도와 복구의 단위다. */
@Document("push_deliveries")
public record PushDelivery(
    @Id String id,
    String postingId,
    String subscriptionId,
    Status status,
    Instant scheduledAt,
    int attempts,
    Instant nextAttemptAt,
    Instant leaseUntil,
    Instant lastAttemptAt,
    Integer lastResponseCode,
    String lastReason
) {
    public enum Status { PENDING, SENDING, ACCEPTED, ABANDONED }

    public PushDelivery {
        Objects.requireNonNull(id);
        Objects.requireNonNull(postingId);
        Objects.requireNonNull(subscriptionId);
        Objects.requireNonNull(status);
        Objects.requireNonNull(scheduledAt);
        Objects.requireNonNull(nextAttemptAt);
        if (attempts < 0) { throw new IllegalArgumentException("Invalid delivery attempts"); }
    }

    public static PushDelivery pending(String id, String postingId, String subscriptionId, Instant scheduledAt) {
        return new PushDelivery(id, postingId, subscriptionId, Status.PENDING, scheduledAt, 0, scheduledAt, null, null, null, null);
    }

    /** 선점: 발송 중으로 바꾸고 시도 횟수를 올리며 리스 만료 시각을 찍는다. */
    public PushDelivery claimed(Instant now, Instant leaseUntil) {
        return new PushDelivery(id, postingId, subscriptionId, Status.SENDING, scheduledAt, Math.incrementExact(attempts), nextAttemptAt,
            Objects.requireNonNull(leaseUntil), Objects.requireNonNull(now), lastResponseCode, lastReason);
    }

    public PushDelivery accepted(Integer responseCode) {
        return new PushDelivery(id, postingId, subscriptionId, Status.ACCEPTED, scheduledAt, attempts, nextAttemptAt, null, lastAttemptAt, responseCode, "ACCEPTED");
    }

    public PushDelivery retry(Instant at, Integer responseCode, String reason) {
        return new PushDelivery(id, postingId, subscriptionId, Status.PENDING, scheduledAt, attempts, Objects.requireNonNull(at), null, lastAttemptAt,
            responseCode, Objects.requireNonNull(reason));
    }

    public PushDelivery abandoned(Integer responseCode, String reason) {
        return new PushDelivery(id, postingId, subscriptionId, Status.ABANDONED, scheduledAt, attempts, nextAttemptAt, null, lastAttemptAt,
            responseCode, Objects.requireNonNull(reason));
    }
}
