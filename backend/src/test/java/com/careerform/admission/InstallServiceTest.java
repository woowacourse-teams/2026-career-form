package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

class InstallServiceTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final String KEY = "00000000-0000-4000-8000-000000000001";
    private final MemoryInstalls store = new MemoryInstalls();
    private final CredentialCrypto crypto = new CredentialCrypto(Base64.getEncoder().encodeToString(new byte[32]));
    private final AtomicInteger issued = new AtomicInteger();

    @Test
    void replaysCredentialsWithoutConsumingNewIssuanceAndAuthenticatesAfterReplayExpiry() {
        var service = service(NOW);
        var first = service.register(KEY, "synthetic-network");
        var replay = service.register(KEY, "synthetic-network");
        assertThat(replay).isEqualTo(first);
        assertThat(issued.get()).isEqualTo(1);
        assertThat(service(NOW.plusSeconds(601)).authenticate(first.installationId(), first.token()))
            .isEqualTo(first.installationId());
        assertThatThrownBy(() -> service(NOW.plusSeconds(600)).register(KEY, "synthetic-network"))
            .isInstanceOfSatisfying(AdmissionFailure.class, failure -> assertThat(failure.code()).isEqualTo("REGISTRATION_EXPIRED"));
        assertThat(store.find(first.installationId()).orElseThrow().tokenHash()).doesNotContain(first.token());
        assertThat(first.toString()).doesNotContain(first.token(), first.installationId());
    }

    @Test
    void rejectsWrongTokensAndRevokedCredentials() {
        var credentials = service(NOW).register(KEY, "synthetic-network");
        assertThatThrownBy(() -> service(NOW).authenticate(credentials.installationId(), "0".repeat(64)))
            .isInstanceOf(AdmissionFailure.class);
        var record = store.find(credentials.installationId()).orElseThrow();
        store.rows.put(record.id(), new InstallRecord(record.id(), record.keyHash(), record.tokenHash(), record.replay(), record.completedAt(), true));
        assertThatThrownBy(() -> service(NOW).authenticate(credentials.installationId(), credentials.token()))
            .isInstanceOf(AdmissionFailure.class);
    }

    @Test
    void rejectsInvalidKeysBeforeIssuance() {
        assertThatThrownBy(() -> service(NOW).register("bad", "synthetic-network")).isInstanceOf(AdmissionFailure.class);
        assertThat(issued.get()).isZero();
    }

    private InstallService service(Instant time) {
        return new InstallService(store, crypto, Clock.fixed(time, ZoneOffset.UTC), (address, key) -> issued.incrementAndGet());
    }

    static final class MemoryInstalls implements InstallStore {
        final Map<String, InstallRecord> rows = new ConcurrentHashMap<>();
        public Optional<InstallRecord> find(String id) { return Optional.ofNullable(rows.get(id)); }
        public Optional<InstallRecord> registration(String keyHash) {
            return rows.values().stream().filter(row -> keyHash.equals(row.keyHash())).findFirst();
        }
        public synchronized boolean insert(InstallRecord record) {
            if (registration(record.keyHash()).isPresent()) return false;
            rows.put(record.id(), record);
            return true;
        }
    }
}
