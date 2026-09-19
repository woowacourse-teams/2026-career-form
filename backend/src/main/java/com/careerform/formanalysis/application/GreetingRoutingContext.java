package com.careerform.formanalysis.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.BitSet;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

@Component
public final class GreetingRoutingContext {

    private static final Duration TTL = Duration.ofMinutes(10);
    private static final int MAX_CONTEXTS = 4096;
    private static final int MAX_POSITIVE_SITES = 4096;
    private static final int OVERFLOW_BITS = 1 << 23;
    private static final long OVERFLOW_BUCKET_SECONDS = 600;

    private final Clock clock;
    private final SecureRandom random;
    private final byte[] overflowSalt = new byte[16];
    private final ConcurrentHashMap<String, Entry> entries = new ConcurrentHashMap<>();
    private final Map<String, Instant> positiveSites = new HashMap<>();
    // Rejected positives stay fail-closed in bounded rotating filters; unrelated hosts remain eligible.
    private long overflowBucket = Long.MIN_VALUE;
    private BitSet recentOverflow = new BitSet();
    private BitSet previousOverflow = new BitSet();

    public GreetingRoutingContext() {
        this(Clock.systemUTC(), new SecureRandom());
    }

    GreetingRoutingContext(Clock clock, SecureRandom random) {
        this.clock = clock;
        this.random = random;
        random.nextBytes(overflowSalt);
    }

    public String issue(String host, String pathPattern) {
        Instant now = clock.instant();
        synchronized (entries) {
            entries.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expiresAt()));
            if (entries.size() >= MAX_CONTEXTS) {
                return null;
            }
            byte[] bytes = new byte[24];
            random.nextBytes(bytes);
            String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            entries.put(token, new Entry(normalize(host), pathPattern, now.plus(TTL)));
            return token;
        }
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

    boolean rememberPositive(String host, String pathPattern) {
        String site = normalize(host);
        synchronized (positiveSites) {
            Instant now = clock.instant();
            Instant previousExpiry = positiveSites.get(site);
            if (previousExpiry != null && now.isBefore(previousExpiry)) {
                positiveSites.put(site, now.plus(TTL));
                return true;
            }
            positiveSites.remove(site);
            if (positiveSites.size() >= MAX_POSITIVE_SITES) {
                positiveSites.entrySet().removeIf(entry -> !now.isBefore(entry.getValue()));
                if (positiveSites.size() >= MAX_POSITIVE_SITES) {
                    rotateOverflow(now);
                    addOverflow(site);
                    return false;
                }
            }
            positiveSites.put(site, now.plus(TTL));
            return true;
        }
    }

    boolean requiresFailClosedOnMissingEvidence(String host, String pathPattern) {
        synchronized (positiveSites) {
            Instant now = clock.instant();
            String site = normalize(host);
            Instant expiry = positiveSites.get(site);
            if (expiry != null && now.isBefore(expiry)) {
                return true;
            }
            positiveSites.remove(site);
            rotateOverflow(now);
            return mightContainOverflow(site);
        }
    }

    private void rotateOverflow(Instant now) {
        long bucket = Math.floorDiv(now.getEpochSecond(), OVERFLOW_BUCKET_SECONDS);
        if (bucket <= overflowBucket) {
            return;
        }
        previousOverflow = bucket == overflowBucket + 1
            ? recentOverflow : new BitSet();
        recentOverflow = new BitSet();
        overflowBucket = bucket;
    }

    private void addOverflow(String host) {
        for (int position : overflowPositions(host)) {
            recentOverflow.set(position);
        }
    }

    private boolean mightContainOverflow(String host) {
        if (recentOverflow.isEmpty() && previousOverflow.isEmpty()) {
            return false;
        }
        int[] positions = overflowPositions(host);
        return containsAll(recentOverflow, positions)
            || containsAll(previousOverflow, positions);
    }

    private static boolean containsAll(BitSet bits, int[] positions) {
        for (int position : positions) {
            if (!bits.get(position)) {
                return false;
            }
        }
        return true;
    }

    private int[] overflowPositions(String host) {
        byte[] digest;
        try {
            MessageDigest hasher = MessageDigest.getInstance("SHA-256");
            hasher.update(overflowSalt);
            digest = hasher.digest(host.getBytes(StandardCharsets.UTF_8));
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
        int[] positions = new int[4];
        for (int index = 0; index < positions.length; index++) {
            int start = index * 4;
            int hash = (digest[start] & 0xff) << 24
                | (digest[start + 1] & 0xff) << 16
                | (digest[start + 2] & 0xff) << 8
                | digest[start + 3] & 0xff;
            positions[index] = hash & (OVERFLOW_BITS - 1);
        }
        return positions;
    }

    private static String normalize(String host) {
        String lower = host.toLowerCase(Locale.ROOT);
        return lower.endsWith(".") ? lower.substring(0, lower.length() - 1) : lower;
    }

    private record Entry(String host, String pathPattern, Instant expiresAt) {
    }

}
