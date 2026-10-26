package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpTimeoutException;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("zerodep Web Push 클라이언트")
class ZerodepWebPushClientTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/synthetic-token";
    private final VapidTestKeys vapid = VapidTestKeys.generate();
    private final VapidTestKeys browser = VapidTestKeys.generate();
    private final byte[] authSecret = randomAuth();
    private final VapidKeys keys = VapidKeys.parse(vapid.publicKey, vapid.privateKey, "mailto:synthetic@example.test");
    private final PushSubscription subscription = new PushSubscription("s1", ENDPOINT, browser.publicKey, VapidTestKeys.base64Url(authSecret), NOW);
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @Test
    @DisplayName("VAPID 서명과 aes128gcm 암호화, 마감까지의 TTL을 실은 요청을 만들고 본문은 4KB 이하이며 수신기에서 풀린다")
    void preparesEncryptedVapidRequestWithinLimit() throws Exception {
        var client = new ZerodepWebPushClient(keys, Duration.ofSeconds(10), clock, request -> new ZerodepWebPushClient.Reply(201, headers(Map.of())));
        var link = "https://careers.example.test/" + "a".repeat(1024 - "https://careers.example.test/".length());
        var payload = PushPayload.of(new JobPosting("0123456789abcdef0123456789abcdef", "회".repeat(80), "직".repeat(120), link,
            NOW.minusSeconds(60), NOW.plusSeconds(3600), NOW.minusSeconds(120)), NOW);

        var request = client.prepare(subscription, payload, Duration.ofSeconds(3600));
        assertThat(request.uri()).isEqualTo(URI.create(ENDPOINT));
        assertThat(request.method()).isEqualTo("POST");
        assertThat(request.timeout()).contains(Duration.ofSeconds(10));
        assertThat(request.headers().firstValue("TTL")).contains("3600");
        assertThat(request.headers().firstValue("Content-Encoding")).contains("aes128gcm");
        assertThat(request.headers().firstValue("Content-Type")).contains("application/octet-stream");
        assertThat(request.headers().firstValue("Authorization")).get().asString()
            .startsWith("vapid t=").contains("k=" + vapid.publicKey).matches("vapid t=[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+, ?k=[A-Za-z0-9_-]+");
        var body = body(request);
        assertThat(body.length).isLessThanOrEqualTo(4096).isGreaterThan(payload.length);
        assertThat(WebPushReceiver.decrypt((ECPrivateKey) browser.pair.getPrivate(), Base64.getUrlDecoder().decode(browser.publicKey), authSecret, body))
            .isEqualTo(payload);
    }

    @Test
    @DisplayName("응답 코드와 Retry-After(초 또는 HTTP 날짜)를 응답 시각 기준 지연으로 돌려준다")
    void returnsStatusAndRetryAfter() throws Exception {
        var client = new ZerodepWebPushClient(keys, Duration.ofSeconds(10), clock,
            request -> new ZerodepWebPushClient.Reply(429, headers(Map.of("Retry-After", List.of("120")))));
        assertThat(client.send(subscription, "{}".getBytes(), Duration.ofSeconds(60))).isEqualTo(new WebPushClient.Response(429, Duration.ofSeconds(120)));
        var date = DateTimeFormatter.RFC_1123_DATE_TIME.format(NOW.plusSeconds(90).atZone(ZoneOffset.UTC));
        assertThat(ZerodepWebPushClient.retryAfter(headers(Map.of("Retry-After", List.of(date))), NOW)).isEqualTo(Duration.ofSeconds(90));
        assertThat(ZerodepWebPushClient.retryAfter(headers(Map.of("Retry-After", List.of("garbage"))), NOW)).isNull();
        assertThat(ZerodepWebPushClient.retryAfter(headers(Map.of()), NOW)).isNull();
        assertThat(ZerodepWebPushClient.retryAfter(headers(Map.of("Retry-After", List.of("-5"))), NOW)).isEqualTo(Duration.ZERO);
        var past = DateTimeFormatter.RFC_1123_DATE_TIME.format(NOW.minusSeconds(90).atZone(ZoneOffset.UTC));
        assertThat(ZerodepWebPushClient.retryAfter(headers(Map.of("Retry-After", List.of(past))), NOW)).isEqualTo(Duration.ZERO);
    }

    @Test
    @DisplayName("전송 예외는 그대로 전달해 발송기가 재시도 표를 적용하게 한다")
    void propagatesTransportFailures() {
        var client = new ZerodepWebPushClient(keys, Duration.ofSeconds(10), clock, request -> { throw new HttpTimeoutException("synthetic"); });
        assertThatThrownBy(() -> client.send(subscription, "{}".getBytes(), Duration.ofSeconds(60))).isInstanceOf(HttpTimeoutException.class);
    }

    @Test
    @DisplayName("TTL은 0초 이상이고 마감까지의 초 단위 정수다")
    void clampsTtl() throws Exception {
        var client = new ZerodepWebPushClient(keys, Duration.ofSeconds(10), clock, request -> new ZerodepWebPushClient.Reply(201, headers(Map.of())));
        assertThat(client.prepare(subscription, "{}".getBytes(), Duration.ofMillis(1500)).headers().firstValue("TTL")).contains("1");
        assertThat(client.prepare(subscription, "{}".getBytes(), Duration.ofSeconds(-5)).headers().firstValue("TTL")).contains("0");
    }

    private static HttpHeaders headers(Map<String, List<String>> values) { return HttpHeaders.of(values, (name, value) -> true); }

    private static byte[] body(HttpRequest request) throws Exception {
        var publisher = request.bodyPublisher().orElseThrow();
        var collected = new CompletableFuture<byte[]>();
        publisher.subscribe(new Flow.Subscriber<>() {
            private final java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            @Override public void onSubscribe(Flow.Subscription subscription) { subscription.request(Long.MAX_VALUE); }
            @Override public void onNext(ByteBuffer item) { var bytes = new byte[item.remaining()]; item.get(bytes); output.writeBytes(bytes); }
            @Override public void onError(Throwable throwable) { collected.completeExceptionally(throwable); }
            @Override public void onComplete() { collected.complete(output.toByteArray()); }
        });
        var bytes = collected.get();
        assertThat(publisher.contentLength()).isEqualTo(bytes.length);
        return bytes;
    }

    private static byte[] randomAuth() {
        var bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        return bytes;
    }
}
