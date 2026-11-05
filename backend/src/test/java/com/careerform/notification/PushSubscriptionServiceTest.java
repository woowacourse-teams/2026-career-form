package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Web Push 구독 등록과 해지")
class PushSubscriptionServiceTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/synthetic-token-1";
    private static final JobCategories CATEGORIES = JobCategories.load();
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final PushSubscriptionService service = new PushSubscriptionService(store, CATEGORIES, Clock.fixed(NOW, ZoneOffset.UTC), Set.of("fcm.googleapis.com"));
    private final String p256dh = VapidTestKeys.generate().publicKey;
    private final String auth = randomAuth();

    @Test
    @DisplayName("같은 endpoint를 두 번 등록해도 구독은 하나이고 기존 구독을 돌려준다")
    void registersOnceForSameEndpoint() {
        var first = service.register(ENDPOINT, p256dh, auth, null);
        var second = service.register(ENDPOINT, VapidTestKeys.generate().publicKey, randomAuth(), null);
        assertThat(first.created()).isTrue();
        assertThat(second.created()).isFalse();
        assertThat(second.subscription()).isEqualTo(first.subscription());
        assertThat(first.subscription().id()).matches("[0-9a-f]{32}");
        assertThat(first.subscription().registeredAt()).isEqualTo(NOW);
        assertThat(first.subscription().p256dh()).isEqualTo(p256dh);
        assertThat(first.subscription().auth()).isEqualTo(auth);
        assertThat(store.subscriptionIds()).hasSize(1);
    }

    @Test
    @DisplayName("해지는 endpoint로 삭제하고 없는 endpoint도 조용히 끝난다")
    void unsubscribeRemovesByEndpointAndIgnoresUnknown() {
        service.register(ENDPOINT, p256dh, auth, null);
        service.unsubscribe(ENDPOINT);
        assertThat(store.subscriptionIds()).isEmpty();
        service.unsubscribe(ENDPOINT);
        assertThat(store.subscriptionIds()).isEmpty();
    }

    @Test
    @DisplayName("허용된 푸시 서비스의 HTTPS endpoint만 받는다")
    void rejectsInvalidEndpoints() {
        assertRejected("http://fcm.googleapis.com/fcm/send/synthetic", p256dh, auth, "ENDPOINT");
        assertRejected("https://push.example.test/send/synthetic", p256dh, auth, "ENDPOINT");
        assertRejected("https://user:secret@fcm.googleapis.com/fcm/send/synthetic", p256dh, auth, "ENDPOINT");
        assertRejected("https://fcm.googleapis.com/fcm/send/" + "a".repeat(2048), p256dh, auth, "ENDPOINT");
        assertRejected(" ", p256dh, auth, "ENDPOINT");
        assertRejected(null, p256dh, auth, "ENDPOINT");
        assertRejected("not a url", p256dh, auth, "ENDPOINT");
        assertThatThrownBy(() -> service.unsubscribe("https://push.example.test/send/synthetic"))
            .isInstanceOf(PushSubscriptionService.InvalidSubscription.class);
        assertThat(store.subscriptionIds()).isEmpty();
    }

    @Test
    @DisplayName("p256dh는 65바이트 비압축 점, auth는 16바이트 base64url이어야 한다")
    void rejectsInvalidKeys() {
        var shortPoint = VapidTestKeys.base64Url(new byte[64]);
        var wrongPrefix = p256dh.replaceFirst("^B", "A");
        assertRejected(ENDPOINT, shortPoint, auth, "KEYS");
        assertRejected(ENDPOINT, wrongPrefix, auth, "KEYS");
        assertRejected(ENDPOINT, p256dh, VapidTestKeys.base64Url(new byte[15]), "KEYS");
        assertRejected(ENDPOINT, p256dh, "+/+/+/+/+/+/+/+/+/+/+/", "KEYS");
        assertRejected(ENDPOINT, p256dh, "", "KEYS");
        assertRejected(ENDPOINT, null, auth, "KEYS");
        assertThat(store.subscriptionIds()).isEmpty();
    }

    @Test
    @DisplayName("기본 허용 호스트는 Chrome이 돌려주는 fcm.googleapis.com과 jmt17.google.com 둘 다 받는다")
    void acceptsBothChromeFcmHostsByDefault() {
        var defaults = new PushSubscriptionService(store, CATEGORIES, Clock.fixed(NOW, ZoneOffset.UTC), PushSettings.defaults().allowedEndpointHosts());
        assertThat(defaults.register("https://jmt17.google.com/fcm/send/synthetic-token-2", p256dh, auth, null).created()).isTrue();
        assertThat(defaults.register("https://fcm.googleapis.com/fcm/send/synthetic-token-3", VapidTestKeys.generate().publicKey, randomAuth(), null).created())
            .isTrue();
        assertThatThrownBy(() -> defaults.register("https://push.example.test/send/synthetic", VapidTestKeys.generate().publicKey, randomAuth(), null))
            .isInstanceOf(PushSubscriptionService.InvalidSubscription.class);
        assertThat(store.subscriptionIds()).hasSize(2);
    }

    @Test
    @DisplayName("새 등록의 받을 직무는 공백을 벗기고 null과 중복을 뺀 순서대로 갱신 시각과 함께 저장되고, 필드가 없으면 미선택이며, 빈 배열도 미선택이다")
    void storesNormalizedRolesOnRegistration() {
        var registered = service.register(ENDPOINT, p256dh, auth, Arrays.asList(" IT.BACKEND ", null, "IT.BACKEND", "DESIGN.UX_UI"));
        assertThat(registered.created()).isTrue();
        assertThat(registered.subscription().roles()).containsExactly("IT.BACKEND", "DESIGN.UX_UI");
        assertThat(registered.subscription().rolesUpdatedAt()).isEqualTo(NOW);
        assertThat(store.findSubscription(registered.subscription().id()).orElseThrow().roles()).containsExactly("IT.BACKEND", "DESIGN.UX_UI");

        var unselected = service.register("https://fcm.googleapis.com/fcm/send/synthetic-token-2", VapidTestKeys.generate().publicKey, randomAuth(), null);
        assertThat(unselected.created()).isTrue();
        assertThat(unselected.subscription().roles()).isNull();
        assertThat(unselected.subscription().rolesUpdatedAt()).isNull();

        var empty = service.register("https://fcm.googleapis.com/fcm/send/synthetic-token-3", VapidTestKeys.generate().publicKey, randomAuth(), List.of());
        assertThat(empty.created()).isTrue();
        assertThat(empty.subscription().roles()).isNull();
        assertThat(empty.subscription().rolesUpdatedAt()).isEqualTo(NOW);
        assertThat(store.countSubscriptionsWithRoles()).isEqualTo(1);
        assertThat(store.countSubscriptions()).isEqualTo(3);
    }

    @Test
    @DisplayName("분류에 없는 직무 코드가 하나라도 있으면 ROLES로 거절하고 새 구독을 만들지도 기존 구독을 바꾸지도 않는다")
    void rejectsUnknownRoles() {
        assertRejected(ENDPOINT, p256dh, auth, List.of("IT.BACKEND", "IT.NOPE"), "ROLES");
        assertRejected(ENDPOINT, p256dh, auth, List.of("it.backend"), "ROLES");
        assertRejected(ENDPOINT, p256dh, auth, List.of("IT"), "ROLES");
        assertRejected(ENDPOINT, p256dh, auth, List.of("  "), "ROLES");
        assertRejected("https://push.example.test/send/synthetic", p256dh, auth, List.of("IT.NOPE"), "ENDPOINT");
        assertRejected(ENDPOINT, "short", auth, List.of("IT.NOPE"), "KEYS");
        assertThat(store.subscriptionIds()).isEmpty();
        service.register(ENDPOINT, p256dh, auth, List.of("IT.BACKEND"));
        assertRejected(ENDPOINT, p256dh, auth, List.of("IT.NOPE"), "ROLES");
        assertThat(store.findSubscriptionByEndpoint(ENDPOINT).orElseThrow().roles()).containsExactly("IT.BACKEND");
    }

    @Test
    @DisplayName("같은 endpoint 재등록은 roles가 있으면 덮어쓰고 갱신 시각을 바꾸며, 필드가 없으면 유지하고, 빈 배열이면 미선택으로 바꾼다")
    void reregistrationOverwritesKeepsOrClearsRoles() {
        var clock = new MutableClock(NOW);
        var ticking = new PushSubscriptionService(store, CATEGORIES, clock, Set.of("fcm.googleapis.com"));
        var first = ticking.register(ENDPOINT, p256dh, auth, List.of("IT.BACKEND"));
        clock.advance(Duration.ofSeconds(10));
        var overwritten = ticking.register(ENDPOINT, VapidTestKeys.generate().publicKey, randomAuth(), List.of("IT.FRONTEND", "IT.MOBILE"));
        assertThat(overwritten.created()).isFalse();
        assertThat(overwritten.subscription().id()).isEqualTo(first.subscription().id());
        assertThat(overwritten.subscription().roles()).containsExactly("IT.FRONTEND", "IT.MOBILE");
        assertThat(overwritten.subscription().rolesUpdatedAt()).isEqualTo(NOW.plusSeconds(10));
        assertThat(overwritten.subscription().p256dh()).as("키는 처음 등록한 값을 유지한다").isEqualTo(p256dh);
        assertThat(overwritten.subscription().registeredAt()).isEqualTo(NOW);

        clock.advance(Duration.ofSeconds(10));
        var kept = ticking.register(ENDPOINT, p256dh, auth, null);
        assertThat(kept.created()).isFalse();
        assertThat(kept.subscription().roles()).containsExactly("IT.FRONTEND", "IT.MOBILE");
        assertThat(kept.subscription().rolesUpdatedAt()).isEqualTo(NOW.plusSeconds(10));

        clock.advance(Duration.ofSeconds(10));
        var cleared = ticking.register(ENDPOINT, p256dh, auth, List.of());
        assertThat(cleared.created()).isFalse();
        assertThat(cleared.subscription().roles()).isNull();
        assertThat(cleared.subscription().rolesUpdatedAt()).isEqualTo(NOW.plusSeconds(30));
        assertThat(store.subscriptionIds()).hasSize(1);
        assertThat(store.findSubscription(first.subscription().id()).orElseThrow().roles()).isNull();
    }

    private void assertRejected(String endpoint, String key, String secret, String reason) { assertRejected(endpoint, key, secret, null, reason); }

    private void assertRejected(String endpoint, String key, String secret, List<String> roles, String reason) {
        assertThatThrownBy(() -> service.register(endpoint, key, secret, roles)).isInstanceOf(PushSubscriptionService.InvalidSubscription.class)
            .extracting(exception -> ((PushSubscriptionService.InvalidSubscription) exception).reason()).isEqualTo(reason);
    }

    private static String randomAuth() {
        var bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        return VapidTestKeys.base64Url(bytes);
    }
}
