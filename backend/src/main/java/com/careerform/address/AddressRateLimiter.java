package com.careerform.address;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 모든 클라이언트가 같은 창을 공유하는 고정 창 제한이다. 창이 바뀌면 전체를 비우므로 메모리는 maxClients로 묶인다. */
@Component
final class AddressRateLimiter {
    private final int maxRequests;
    private final Duration window;
    private final int maxClients;
    private final Clock clock;
    private final Map<String, Integer> requests = new HashMap<>();
    private Instant windowStartedAt;

    @Autowired
    AddressRateLimiter(
        @Value("${career-form.address.rate-limit.max-requests:30}") int maxRequests,
        @Value("${career-form.address.rate-limit.window:60s}") Duration window,
        @Value("${career-form.address.rate-limit.max-clients:10000}") int maxClients
    ) {
        this(maxRequests, window, maxClients, Clock.systemUTC());
    }

    AddressRateLimiter(int maxRequests, Duration window, int maxClients, Clock clock) {
        if (maxRequests < 1 || window.isZero() || window.isNegative() || maxClients < 1) {
            throw new IllegalStateException("Invalid address rate limit configuration");
        }
        this.maxRequests = maxRequests;
        this.window = window;
        this.maxClients = maxClients;
        this.clock = clock;
        this.windowStartedAt = clock.instant();
    }

    synchronized boolean tryAcquire(String client) {
        var now = clock.instant();
        if (!now.isBefore(windowStartedAt.plus(window))) {
            requests.clear();
            windowStartedAt = now;
        }
        var used = requests.get(client);
        if (used == null ? requests.size() >= maxClients : used >= maxRequests) {
            return false;
        }
        requests.put(client, used == null ? 1 : used + 1);
        return true;
    }

    /** 남은 시간의 상한이다. 창 전체 길이를 알려 주므로 이 시간 뒤에는 항상 새 창이다. */
    long retryAfterSeconds() {
        return Math.max(1, window.toSeconds());
    }

    synchronized int trackedClients() {
        return requests.size();
    }
}
