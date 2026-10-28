package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoClients;

@EnabledIfEnvironmentVariable(named = "ANALYSIS_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+")
class MongoAdmissionTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");

    @Test
    void independentStoresApproveOnlyOneLastUnitAndReturnOnlyOnce() throws Exception {
        try (var client = MongoClients.create(System.getenv("ANALYSIS_TEST_MONGO_URI"))) {
            var mongo = new MongoTemplate(client, "cf359_test_" + UUID.randomUUID().toString().replace("-", ""));
            var first = new MongoUsageStore(mongo);
            var second = new MongoUsageStore(mongo);
            first.ensureIndexes();
            var expiry = NOW.plusSeconds(90000);
            try (var threads = Executors.newVirtualThreadPerTaskExecutor()) {
                var calls = IntStream.range(0, 24).<Callable<Boolean>>mapToObj(index -> () -> {
                    try {
                        (index % 2 == 0 ? first : second).change("remaining-one", 1, expiry,
                            bucket -> bucket.reserve("operation-" + index, NOW.plusSeconds(120), NOW));
                        return true;
                    } catch (AdmissionFailure rejected) { return false; }
                }).toList();
                var results = threads.invokeAll(calls);
                var approved = 0;
                for (var result : results) if (result.get()) approved++;
                assertThat(approved).isEqualTo(1);
            }
            var reserved = mongo.findById("remaining-one", UsageBucket.class);
            var operation = reserved.entries().keySet().iterator().next();
            first.change(reserved.id(), 1, expiry, bucket -> bucket.settle(operation, false, NOW));
            second.change(reserved.id(), 1, expiry, bucket -> bucket.settle(operation, false, NOW));
            assertThat(mongo.findById(reserved.id(), UsageBucket.class).used()).isZero();
        }
    }

    @Test
    void uniqueRegistrationReplaysAcrossProcessesAndRemovesOnlyRecoverySecrets() throws Exception {
        try (var client = MongoClients.create(System.getenv("ANALYSIS_TEST_MONGO_URI"))) {
            var mongo = new MongoTemplate(client, "cf359_test_" + UUID.randomUUID().toString().replace("-", ""));
            var store = new MongoInstallStore(mongo);
            store.ensureIndexes();
            var crypto = new CredentialCrypto(Base64.getEncoder().encodeToString(new byte[32]));
            var clock = Clock.fixed(NOW, ZoneOffset.UTC);
            var first = new InstallService(store, crypto, clock, (address, key) -> { });
            var second = new InstallService(new MongoInstallStore(mongo), crypto, clock, (address, key) -> { });
            var key = UUID.randomUUID().toString();
            try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                var credentials = executor.invokeAll(IntStream.range(0, 12).<Callable<InstallService.Credentials>>mapToObj(index ->
                    () -> (index % 2 == 0 ? first : second).register(key, "synthetic-network")).toList());
                var expected = credentials.getFirst().get();
                for (var result : credentials) assertThat(result.get()).isEqualTo(expected);
                store.clearRecoveryCopies(NOW.plusSeconds(601));
                assertThat(store.find(expected.installationId()).orElseThrow().replay()).isNull();
                assertThat(second.authenticate(expected.installationId(), expected.token())).isEqualTo(expected.installationId());
                store.clearRecoveryCopies(NOW.plusSeconds(86401));
                assertThat(store.registration(crypto.digest("registration", key))).isEmpty();
                assertThat(second.authenticate(expected.installationId(), expected.token())).isEqualTo(expected.installationId());
            }
        }
    }
    @Test
    void anotherProcessReturnsExpiredReservationWithoutUndoingCommittedUsage() {
        try (var client = MongoClients.create(System.getenv("ANALYSIS_TEST_MONGO_URI"))) {
            var mongo = new MongoTemplate(client, "cf359_test_" + UUID.randomUUID().toString().replace("-", ""));
            var first = new MongoUsageStore(mongo);
            first.ensureIndexes();
            var expires = NOW.plusSeconds(90000);
            first.change("abandoned", 2, expires, bucket -> bucket
                .reserve("committed", NOW.plusSeconds(120), NOW).settle("committed", true, NOW)
                .reserve("lost", NOW.plusSeconds(120), NOW));
            var restarted = new MongoUsageStore(mongo);
            restarted.returnExpired(NOW.plusSeconds(121));
            first.returnExpired(NOW.plusSeconds(122));
            var late = first.change("abandoned", 2, expires, bucket -> bucket.settle("lost", true, NOW.plusSeconds(123)));
            assertThat(late.used()).isEqualTo(1);
            assertThat(late.entries().get("committed").state()).isEqualTo(UsageBucket.State.COMMITTED);
            assertThat(late.entries().get("lost").state()).isEqualTo(UsageBucket.State.EXPIRED);
        }
    }

    @Test
    void lostWriteAcknowledgementDoesNotDuplicateReservationOrReturn() {
        try (var client = MongoClients.create(System.getenv("ANALYSIS_TEST_MONGO_URI"))) {
            var mongo = new LostAcknowledgementTemplate(new MongoTemplate(client, "cf359_test_" + UUID.randomUUID().toString().replace("-", "")));
            var store = new MongoUsageStore(mongo);
            var expiry = NOW.plusSeconds(90000);
            var reserved = store.change("lost-ack", 1, expiry, bucket -> bucket.reserve("same-operation", NOW.plusSeconds(120), NOW));
            assertThat(reserved.used()).isEqualTo(1);
            assertThat(reserved.entries()).hasSize(1);
            mongo.failed.set(false);
            var returned = store.change("lost-ack", 1, expiry, bucket -> bucket.settle("same-operation", false, NOW));
            assertThat(returned.used()).isZero();
            assertThat(returned.entries()).hasSize(1);
        }
    }

    private static final class LostAcknowledgementTemplate extends MongoTemplate {
        private final java.util.concurrent.atomic.AtomicBoolean failed = new java.util.concurrent.atomic.AtomicBoolean();
        private LostAcknowledgementTemplate(MongoTemplate source) { super(source.getMongoDatabaseFactory(), source.getConverter()); }
        @Override public <T> T findAndReplace(org.springframework.data.mongodb.core.query.Query query, T replacement,
                                             org.springframework.data.mongodb.core.FindAndReplaceOptions options) {
            var result = super.findAndReplace(query, replacement, options);
            if (failed.compareAndSet(false, true)) throw new org.springframework.dao.DataAccessResourceFailureException("Synthetic acknowledgement loss after applied write");
            return result;
        }
    }

}
