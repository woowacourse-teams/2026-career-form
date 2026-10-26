package com.careerform.notification;

import java.time.Instant;
import java.util.Objects;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/** Web Push 구독. endpoint와 키는 개인정보로 취급해 toString에도 드러내지 않는다. */
@Document("push_subscriptions")
public record PushSubscription(
    @Id String id,
    String endpoint,
    String p256dh,
    String auth,
    Instant registeredAt
) {
    public PushSubscription {
        Objects.requireNonNull(id);
        Objects.requireNonNull(endpoint);
        Objects.requireNonNull(p256dh);
        Objects.requireNonNull(auth);
        Objects.requireNonNull(registeredAt);
    }

    @Override
    public String toString() { return "PushSubscription[id=" + id + "]"; }
}
