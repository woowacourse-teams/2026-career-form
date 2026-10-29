package com.careerform.admission;

import java.time.Clock;
import java.util.UUID;
import java.util.function.BiConsumer;

public final class InstallService {
    private final InstallStore store;
    private final CredentialCrypto crypto;
    private final Clock clock;
    private final BiConsumer<String, String> issuance;

    public InstallService(InstallStore store, CredentialCrypto crypto, Clock clock, BiConsumer<String, String> issuance) {
        this.store = store;
        this.crypto = crypto;
        this.clock = clock;
        this.issuance = issuance;
    }

    public record Credentials(String installationId, String token) {
        @Override public String toString() { return "Credentials[redacted]"; }
    }

    public Credentials register(String key, String address) {
        if (key == null || !key.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")) {
            throw new AdmissionFailure("INVALID_REGISTRATION", 400, null);
        }
        var hash = crypto.digest("registration", key);
        try {
            var existing = store.registration(hash);
            if (existing.isPresent()) return replay(existing.orElseThrow());
            issuance.accept(address, hash);
            var id = UUID.randomUUID().toString();
            var token = crypto.token();
            var record = new InstallRecord(id, hash, crypto.tokenHash(token), crypto.seal(token, id + hash), clock.instant(), false);
            if (store.insert(record)) return new Credentials(id, token);
            return replay(store.registration(hash).orElseThrow(AdmissionFailure::unavailable));
        } catch (AdmissionFailure error) { throw error; }
        catch (RuntimeException error) { throw AdmissionFailure.unavailable(); }
    }

    public String authenticate(String id, String token) {
        if (id == null || !id.matches("[0-9a-f-]{36}") || token == null || !token.matches("[0-9a-f]{64}")) {
            throw new AdmissionFailure("INVALID_INSTALLATION", 401, null);
        }
        try {
            var record = store.find(id).orElseThrow(() -> new AdmissionFailure("INVALID_INSTALLATION", 401, null));
            if (record.revoked() || !crypto.matches(token, record.tokenHash())) {
                throw new AdmissionFailure("INVALID_INSTALLATION", 401, null);
            }
            return record.id();
        } catch (AdmissionFailure error) { throw error; }
        catch (RuntimeException error) { throw AdmissionFailure.unavailable(); }
    }

    private Credentials replay(InstallRecord record) {
        if (record.revoked()) throw new AdmissionFailure("INVALID_INSTALLATION", 401, null);
        if (!clock.instant().isBefore(record.completedAt().plusSeconds(600)) || record.replay() == null) {
            throw new AdmissionFailure("REGISTRATION_EXPIRED", 410, null);
        }
        return new Credentials(record.id(), crypto.open(record.replay(), record.id() + record.keyHash()));
    }
}
