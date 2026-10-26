package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Web Push 구독 등록과 해지")
class PushSubscriptionServiceTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/synthetic-token-1";
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final PushSubscriptionService service = new PushSubscriptionService(store, Clock.fixed(NOW, ZoneOffset.UTC), Set.of("fcm.googleapis.com"));
    private final String p256dh = VapidTestKeys.generate().publicKey;
    private final String auth = randomAuth();

    @Test
    @DisplayName("같은 endpoint를 두 번 등록해도 구독은 하나이고 기존 구독을 돌려준다")
    void registersOnceForSameEndpoint() {
        var first = service.register(ENDPOINT, p256dh, auth);
        var second = service.register(ENDPOINT, VapidTestKeys.generate().publicKey, randomAuth());
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
        service.register(ENDPOINT, p256dh, auth);
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
        var defaults = new PushSubscriptionService(store, Clock.fixed(NOW, ZoneOffset.UTC), PushSettings.defaults().allowedEndpointHosts());
        assertThat(defaults.register("https://jmt17.google.com/fcm/send/synthetic-token-2", p256dh, auth).created()).isTrue();
        assertThat(defaults.register("https://fcm.googleapis.com/fcm/send/synthetic-token-3", VapidTestKeys.generate().publicKey, randomAuth()).created()).isTrue();
        assertThatThrownBy(() -> defaults.register("https://push.example.test/send/synthetic", VapidTestKeys.generate().publicKey, randomAuth()))
            .isInstanceOf(PushSubscriptionService.InvalidSubscription.class);
        assertThat(store.subscriptionIds()).hasSize(2);
    }

    private void assertRejected(String endpoint, String key, String secret, String reason) {
        assertThatThrownBy(() -> service.register(endpoint, key, secret)).isInstanceOf(PushSubscriptionService.InvalidSubscription.class)
            .extracting(exception -> ((PushSubscriptionService.InvalidSubscription) exception).reason()).isEqualTo(reason);
    }

    private static String randomAuth() {
        var bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        return VapidTestKeys.base64Url(bytes);
    }
}
