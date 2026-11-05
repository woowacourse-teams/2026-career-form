package com.careerform.notification;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

import com.zerodeplibs.webpush.VAPIDKeyPair;
import com.zerodeplibs.webpush.VAPIDKeyPairs;
import com.zerodeplibs.webpush.httpclient.StandardHttpClientRequestPreparer;
import com.zerodeplibs.webpush.key.PrivateKeySources;
import com.zerodeplibs.webpush.key.PublicKeySources;

/**
 * zerodep-web-push-java로 VAPID 서명과 aes128gcm 암호화를 하고 JDK HttpClient로 보낸다.
 * 응답 본문은 읽지 않으며 상태 코드와 Retry-After만 돌려준다.
 */
public final class ZerodepWebPushClient implements WebPushClient {
    private static final int VAPID_JWT_HOURS = 12;
    private final VAPIDKeyPair keyPair;
    private final String subject;
    private final Duration timeout;
    private final Clock clock;
    private final Transport transport;

    @FunctionalInterface
    interface Transport { Reply send(HttpRequest request) throws IOException, InterruptedException; }

    record Reply(int statusCode, HttpHeaders headers) { }

    public ZerodepWebPushClient(VapidKeys keys, Duration timeout, Clock clock) { this(keys, timeout, clock, defaultTransport()); }

    ZerodepWebPushClient(VapidKeys keys, Duration timeout, Clock clock, Transport transport) {
        this.keyPair = VAPIDKeyPairs.of(PrivateKeySources.ofECPrivateKey(keys.ecPrivateKey()), PublicKeySources.ofECPublicKey(keys.ecPublicKey()));
        this.subject = keys.subject();
        this.timeout = Objects.requireNonNull(timeout);
        this.clock = Objects.requireNonNull(clock);
        this.transport = Objects.requireNonNull(transport);
    }

    @Override
    public Response send(PushSubscription subscription, byte[] payload, Duration ttl) throws IOException, InterruptedException {
        var reply = transport.send(prepare(subscription, payload, ttl));
        return new Response(reply.statusCode(), retryAfter(reply.headers(), clock.instant()));
    }

    HttpRequest prepare(PushSubscription subscription, byte[] payload, Duration ttl) {
        var target = new com.zerodeplibs.webpush.PushSubscription();
        target.setEndpoint(subscription.endpoint());
        var keys = new com.zerodeplibs.webpush.PushSubscription.Keys();
        keys.setP256dh(subscription.p256dh());
        keys.setAuth(subscription.auth());
        target.setKeys(keys);
        return StandardHttpClientRequestPreparer.getBuilder()
            .pushSubscription(target)
            .vapidJWTExpiresAfter(VAPID_JWT_HOURS, TimeUnit.HOURS)
            .vapidJWTSubject(subject)
            .pushMessage(payload)
            .ttl(Math.max(0, ttl.getSeconds()), TimeUnit.SECONDS)
            .urgencyNormal()
            .build(keyPair)
            .toRequestBuilder()
            .setHeader("Content-Type", "application/octet-stream")
            .timeout(timeout)
            .build();
    }

    static Duration retryAfter(HttpHeaders headers, Instant now) {
        var value = headers.firstValue("Retry-After").map(String::strip).orElse("");
        if (value.isEmpty()) { return null; }
        if (value.matches("-?[0-9]{1,9}")) {
            var seconds = Long.parseLong(value);
            return seconds < 0 ? Duration.ZERO : Duration.ofSeconds(seconds);
        }
        try {
            var delay = Duration.between(now, ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant());
            return delay.isNegative() ? Duration.ZERO : delay;
        } catch (DateTimeParseException exception) {
            return null;
        }
    }

    private static Transport defaultTransport() {
        var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
        return request -> {
            var response = client.send(request, HttpResponse.BodyHandlers.discarding());
            return new Reply(response.statusCode(), response.headers());
        };
    }
}
