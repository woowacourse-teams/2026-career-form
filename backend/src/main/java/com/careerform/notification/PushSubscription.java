package com.careerform.notification;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Web Push 구독. endpoint와 키는 개인정보로 취급해 toString에도 드러내지 않는다.
 * roles는 받기로 한 소분류 코드 배열이며 null이면 미선택이고, rolesUpdatedAt은 마지막으로 roles를 정한 시각이다(둘 다 없는 구 문서는 null).
 */
@Document("push_subscriptions")
public record PushSubscription(
    @Id String id,
    String endpoint,
    String p256dh,
    String auth,
    Instant registeredAt,
    List<String> roles,
    Instant rolesUpdatedAt
) {
    public PushSubscription {
        Objects.requireNonNull(id);
        Objects.requireNonNull(endpoint);
        Objects.requireNonNull(p256dh);
        Objects.requireNonNull(auth);
        Objects.requireNonNull(registeredAt);
        roles = roles == null ? null : List.copyOf(roles);
    }

    /** 받을 직무만 바꾼 사본. roles가 null이면 미선택이다. */
    public PushSubscription withRoles(List<String> roles, Instant rolesUpdatedAt) {
        return new PushSubscription(id, endpoint, p256dh, auth, registeredAt, roles, rolesUpdatedAt);
    }

    @Override
    public String toString() { return "PushSubscription[id=" + id + "]"; }
}
