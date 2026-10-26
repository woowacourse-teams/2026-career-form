package com.careerform.notification;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.util.Base64;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/** Web Push 구독 등록과 해지. endpoint는 허용된 푸시 서비스 호스트의 HTTPS 주소만 받는다. */
public final class PushSubscriptionService {
    static final int MAX_ENDPOINT_LENGTH = 2048;
    private static final int UNCOMPRESSED_POINT_LENGTH = 65;
    private static final int AUTH_SECRET_LENGTH = 16;
    private final NotificationStore store;
    private final Clock clock;
    private final Set<String> allowedEndpointHosts;

    public PushSubscriptionService(NotificationStore store, Clock clock, Set<String> allowedEndpointHosts) {
        this.store = Objects.requireNonNull(store);
        this.clock = Objects.requireNonNull(clock);
        this.allowedEndpointHosts = Set.copyOf(allowedEndpointHosts);
        if (this.allowedEndpointHosts.isEmpty()) { throw new IllegalArgumentException("Allowed push endpoint hosts are required"); }
    }

    public record Registration(PushSubscription subscription, boolean created) { }

    public static final class InvalidSubscription extends IllegalArgumentException {
        private final String reason;

        public InvalidSubscription(String reason) {
            super("Invalid subscription: " + reason);
            this.reason = reason;
        }

        public String reason() { return reason; }
    }

    public Registration register(String endpoint, String p256dh, String auth) {
        var normalizedEndpoint = endpoint(endpoint);
        var point = key(p256dh, UNCOMPRESSED_POINT_LENGTH, true);
        var secret = key(auth, AUTH_SECRET_LENGTH, false);
        var existing = store.findSubscriptionByEndpoint(normalizedEndpoint);
        if (existing.isPresent()) { return new Registration(existing.get(), false); }
        var subscription = new PushSubscription(Identifiers.random(), normalizedEndpoint, point, secret, clock.instant());
        if (store.insertSubscription(subscription)) { return new Registration(subscription, true); }
        return new Registration(store.findSubscriptionByEndpoint(normalizedEndpoint)
            .orElseThrow(() -> new IllegalStateException("Subscription disappeared while registering")), false);
    }

    public void unsubscribe(String endpoint) { store.deleteSubscriptionByEndpoint(endpoint(endpoint)); }

    private String endpoint(String value) {
        if (value == null || value.isBlank() || value.length() > MAX_ENDPOINT_LENGTH) { throw new InvalidSubscription("ENDPOINT"); }
        URI uri;
        try {
            uri = new URI(value.strip());
        } catch (URISyntaxException exception) {
            throw new InvalidSubscription("ENDPOINT");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null || uri.getRawFragment() != null || uri.getHost() == null
            || !allowedEndpointHosts.contains(uri.getHost().toLowerCase(Locale.ROOT))) {
            throw new InvalidSubscription("ENDPOINT");
        }
        return uri.toString();
    }

    private static String key(String value, int expectedLength, boolean uncompressedPoint) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{1,200}")) { throw new InvalidSubscription("KEYS"); }
        byte[] bytes;
        try {
            bytes = Base64.getUrlDecoder().decode(value);
        } catch (IllegalArgumentException exception) {
            throw new InvalidSubscription("KEYS");
        }
        if (bytes.length != expectedLength || (uncompressedPoint && bytes[0] != 4)) { throw new InvalidSubscription("KEYS"); }
        return value;
    }
}
