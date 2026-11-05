package com.careerform.notification;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Web Push 구독 등록과 해지. endpoint는 허용된 푸시 서비스 호스트의 HTTPS 주소만 받는다.
 * 받을 직무 roles는 요청에 없으면(null) 새 구독은 미선택, 기존 구독은 유지하고, 빈 배열이면 미선택으로, 값이 있으면 덮어쓴다. 구독당 상한은 없다.
 */
public final class PushSubscriptionService {
    static final int MAX_ENDPOINT_LENGTH = 2048;
    private static final int UNCOMPRESSED_POINT_LENGTH = 65;
    private static final int AUTH_SECRET_LENGTH = 16;
    private final NotificationStore store;
    private final JobCategories categories;
    private final Clock clock;
    private final Set<String> allowedEndpointHosts;

    public PushSubscriptionService(NotificationStore store, JobCategories categories, Clock clock, Set<String> allowedEndpointHosts) {
        this.store = Objects.requireNonNull(store);
        this.categories = Objects.requireNonNull(categories);
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

    public Registration register(String endpoint, String p256dh, String auth, List<String> roles) {
        var normalizedEndpoint = endpoint(endpoint);
        var point = key(p256dh, UNCOMPRESSED_POINT_LENGTH, true);
        var secret = key(auth, AUTH_SECRET_LENGTH, false);
        var selection = roles(roles);
        var now = clock.instant();
        var existing = store.findSubscriptionByEndpoint(normalizedEndpoint);
        if (existing.isPresent()) { return new Registration(roles == null ? existing.get() : updateRoles(existing.get(), selection, now), false); }
        var subscription = new PushSubscription(Identifiers.random(), normalizedEndpoint, point, secret, now, selection, roles == null ? null : now);
        if (store.insertSubscription(subscription)) { return new Registration(subscription, true); }
        var raced = store.findSubscriptionByEndpoint(normalizedEndpoint).orElseThrow(() -> new IllegalStateException("Subscription disappeared while registering"));
        return new Registration(roles == null ? raced : updateRoles(raced, selection, now), false);
    }

    public void unsubscribe(String endpoint) { store.deleteSubscriptionByEndpoint(endpoint(endpoint)); }

    /** 요청이 roles를 보냈을 때만 부른다. 저장 뒤 갱신된 구독을 다시 읽어 돌려준다. */
    private PushSubscription updateRoles(PushSubscription existing, List<String> roles, Instant now) {
        store.updateSubscriptionRoles(existing.id(), roles, now);
        return store.findSubscription(existing.id()).orElseThrow(() -> new IllegalStateException("Subscription disappeared while updating roles"));
    }

    /** null이거나 정규화 뒤 비면 미선택(null). 그 외에는 모든 코드가 분류에 있어야 한다. */
    private List<String> roles(List<String> value) {
        if (value == null) { return null; }
        var roles = JobCategories.normalize(value);
        if (roles.isEmpty()) { return null; }
        if (!roles.stream().allMatch(categories::containsRole)) { throw new InvalidSubscription("ROLES"); }
        return roles;
    }

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
