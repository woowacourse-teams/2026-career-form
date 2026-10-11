package com.careerform.quality;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

public final class QualityAccess {

    private static final Duration ATTEMPT_WINDOW = Duration.ofMinutes(10);
    private final Clock clock;
    private final Optional<QualityPassword> password;
    private final String readonlyHash;
    private final SessionStore sessions;
    private final SecureRandom random = new SecureRandom();
    private Map<String, Attempt> attempts = Map.of();

    public QualityAccess(Clock clock, String passwordHash, String readonlyHash, SessionStore sessions) {
        this.clock = Objects.requireNonNull(clock);
        this.password = QualityPassword.from(passwordHash);
        this.readonlyHash = readonlyHash == null ? "" : readonlyHash;
        this.sessions = Objects.requireNonNull(sessions);
    }

    public enum LoginStatus {
        OK,
        INVALID,
        THROTTLED,
        NOT_CONFIGURED
    }

    public record Login(LoginStatus status) {
        @Override
        public String toString() {
            return "Login[status=" + status + "]";
        }
    }

    @Document("quality_sessions")
    public record Session(
        @Id String id,
        String csrfHash,
        String configurationKey,
        @Indexed(expireAfter = "0s") Instant expiresAt
    ) {
    }

    public interface SessionStore {
        Optional<Session> find(String id);

        void save(Session session);

        void delete(String id);
    }

    private record Attempt(Instant startedAt, int failures) {
    }

    public synchronized Login login(String provided, String source) {
        if (password.isEmpty()) {
            return failed(LoginStatus.NOT_CONFIGURED);
        }
        var now = clock.instant();
        attempts = attempts.entrySet().stream()
            .filter(entry -> now.isBefore(entry.getValue().startedAt.plus(ATTEMPT_WINDOW)))
            .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
        var key = QualityProjection.digest(source == null ? "UNKNOWN" : source);
        var attempt = attempts.getOrDefault(key, new Attempt(now, 0));
        if (attempt.failures >= 5 || (attempts.size() >= 1000 && !attempts.containsKey(key))) {
            return failed(LoginStatus.THROTTLED);
        }
        if (!password.orElseThrow().matches(provided)) {
            attempts = replaceAttempt(key, new Attempt(attempt.startedAt, attempt.failures + 1));
            return failed(LoginStatus.INVALID);
        }
        attempts = attempts.entrySet().stream().filter(entry -> !entry.getKey().equals(key))
            .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
        return new Login(LoginStatus.OK);
    }

    public boolean configured() { return password.isPresent(); }

    public synchronized String claimant(String existing) {
        var claimed = validClaimant(existing) ? existing : token();
        return renewVerifiedClaimant(claimed);
    }

    synchronized String renewVerifiedClaimant(String claimed) {
        if (!validToken(claimed)) { throw new IllegalArgumentException("Invalid claimant"); }
        sessions.save(new Session("claimant_" + QualityProjection.digest(claimed), "", "CLAIMANT", clock.instant().plusSeconds(86400)));
        return claimed;
    }

    public boolean validClaimant(String token) {
        return validToken(token) && sessions.find("claimant_" + QualityProjection.digest(token))
            .filter(session -> session.configurationKey().equals("CLAIMANT") && clock.instant().isBefore(session.expiresAt())).isPresent();
    }

    public boolean canQuery(String provided) {
        return readonlyHash.matches("[0-9a-f]{64}") && provided != null && provided.length() >= 16 && provided.length() <= 256
            && equal(readonlyHash, QualityProjection.digest(provided));
    }

    private Map<String, Attempt> replaceAttempt(String key, Attempt attempt) {
        return Stream.concat(attempts.entrySet().stream().filter(entry -> !entry.getKey().equals(key)),
            Stream.of(Map.entry(key, attempt))).collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    private Login failed(LoginStatus status) {
        return new Login(status);
    }

    private String token() {
        var bytes = new byte[32];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private boolean validToken(String value) {
        return value != null && value.matches("[0-9a-f]{64}");
    }

    private boolean equal(String first, String second) {
        return MessageDigest.isEqual(first.getBytes(StandardCharsets.US_ASCII), second.getBytes(StandardCharsets.US_ASCII));
    }
}
