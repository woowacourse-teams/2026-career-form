package com.careerform.formanalysis.application;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

@Component
public final class GreetingRoutingContext {

    private static final Duration TTL = Duration.ofMinutes(10);
    private static final int MAX_CONTEXTS = 4096;

    private final Clock clock;
    private final SecureRandom random;
    private final ConcurrentHashMap<String, Entry> entries = new ConcurrentHashMap<>();

    public GreetingRoutingContext() {
        this(Clock.systemUTC(), new SecureRandom());
    }

    GreetingRoutingContext(Clock clock, SecureRandom random) {
        this.clock = clock;
        this.random = random;
    }

    public String issue(String host, String pathPattern) {
        Instant now = clock.instant();
        if (entries.size() >= MAX_CONTEXTS) {
            entries.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expiresAt()));
            if (entries.size() >= MAX_CONTEXTS) {
                return null;
            }
        }
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        entries.put(token, new Entry(normalize(host), pathPattern, now.plus(TTL)));
        return token;
    }

    public boolean isValid(String token, String host, String pathPattern) {
        if (token == null || token.length() != 32 || host == null || pathPattern == null) {
            return false;
        }
        Entry entry = entries.get(token);
        if (entry == null) {
            return false;
        }
        if (!clock.instant().isBefore(entry.expiresAt())) {
            entries.remove(token, entry);
            return false;
        }
        return entry.host().equals(normalize(host))
            && entry.pathPattern().equals(pathPattern);
    }

    private static String normalize(String host) {
        String lower = host.toLowerCase(Locale.ROOT);
        return lower.endsWith(".") ? lower.substring(0, lower.length() - 1) : lower;
    }

    private record Entry(String host, String pathPattern, Instant expiresAt) {
    }
}
