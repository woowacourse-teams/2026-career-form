package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class QualityAsyncServiceTest {
    private final Clock clock = Clock.systemUTC();
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final java.util.concurrent.atomic.AtomicInteger reads = new java.util.concurrent.atomic.AtomicInteger();
    private final Map<String, QualityRecord> records = new ConcurrentHashMap<>();
    private final QualityStore store = new QualityStore() {
        public boolean insert(QualityRecord value) { return records.putIfAbsent(value.id(), value) == null; }
        public Optional<QualityRecord> find(String id, Instant now) { reads.incrementAndGet(); return Optional.ofNullable(records.get(id)); }
        public boolean replace(QualityRecord before, QualityRecord next) { return records.replace(before.id(), before, next); }
        public List<QualityRecord> list(Query query, Instant now) { return List.of(); }
    };

    @Test
    void missingSnapshotWaitsInMemoryInsteadOfPollingMongo() {
        try (var queue = queue()) {
            var service = service(queue);
            var credentials = service.register(new QualityRegistration.Input("a".repeat(32), "b".repeat(64)));
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).until(() -> queue.active() == 0 && queue.waiting() == 0);
            reads.set(0);
            service.report(credentials.runId(), credentials.token(),
                new QualityCollectionService.Report("event", "not-ready", Map.of(), QualityExecution.Status.COMPLETED));
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).until(() -> meters.get("quality.tasks.execution").timer().count() >= 4);
            assertThat(reads.get()).isZero();
        }
    }

    @Test
    void registrationAndReportAcknowledgeWhileDatabaseWorkerIsBlocked() throws Exception {
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var queue = queue()) {
            queue.submit(1, () -> { started.countDown(); release.await(); return true; });
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            var service = service(queue);
            try {
                var credentials = service.register(new QualityRegistration.Input("a".repeat(32), "b".repeat(64)));
                service.report(credentials.runId(), credentials.token(), report());
                assertThat(records).isEmpty();
            } finally { release.countDown(); }
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(3)).untilAsserted(() ->
                assertThat(records.values().stream().filter(record -> record.kind() == QualityRecord.Kind.EXECUTION)).singleElement()
                    .satisfies(record -> assertThat(((QualityCollectionService.Run) record.payload()).execution().terminal()).isEqualTo(QualityExecution.Status.COMPLETED)));
        }
    }

    @Test
    void reversedArrivalWaitsForRegistrationAndSnapshotAndDeduplicatesReport() throws Exception {
        try (var queue = queue()) {
            var service = service(queue);
            var connection = service.connection("a".repeat(32), "b".repeat(64));
            var snapshot = new QualityProjection.Snapshot(QualityProjection.digest("snapshot"), "synthetic.test", "shape",
                List.of(new QualityProjection.Field(QualityProjection.digest("snapshot|field"), "0", "TEXT", true, true)));
            service.observe(new QualityAsyncService.Observation(connection, "synthetic.test", null, false, "GENERIC", null, "1.0", null,
                new QualityCollectionService.RequestEvent("FIELDS", 200, 2, snapshot.counts(), List.of()), snapshot));
            var credentials = service.register(new QualityRegistration.Input("a".repeat(32), "b".repeat(64)));
            var report = new QualityCollectionService.Report("event", "snapshot", Map.of("field", new QualityExecution.ClientState(true, true, true, true, null)), QualityExecution.Status.COMPLETED);
            service.report(credentials.runId(), credentials.token(), report);
            service.report(credentials.runId(), credentials.token(), report);
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> {
                var run = (QualityCollectionService.Run) records.get(credentials.runId()).payload();
                assertThat(run.execution().counts().retained()).isEqualTo(1);
                assertThat(run.execution().events()).hasSize(1);
            });
            assertThat(records.values().stream().filter(record -> record.kind() == QualityRecord.Kind.REQUEST)).hasSize(1);
        }
    }

    @Test
    void rejectsForeignCredentialsAndDuplicateRegistrationWithoutDatabaseLookup() {
        try (var queue = queue()) {
            var service = service(queue);
            var input = new QualityRegistration.Input("a".repeat(32), "b".repeat(64));
            var credentials = service.register(input);
            assertThatThrownBy(() -> service.register(input)).isInstanceOf(QualityAdmissionException.class)
                .satisfies(exception -> assertThat(((QualityAdmissionException) exception).status()).isEqualTo(409));
            assertThatThrownBy(() -> service.report(credentials.runId(), "f".repeat(64), report()))
                .isInstanceOf(QualityAdmissionException.class).satisfies(exception -> assertThat(((QualityAdmissionException) exception).status()).isEqualTo(401));
        }
    }

    private QualityCollectionService.Report report() { return new QualityCollectionService.Report("event", null, Map.of(), QualityExecution.Status.COMPLETED); }
    private QualityTaskQueue queue() { return new QualityTaskQueue(64, 4194304, 131072, Duration.ofSeconds(30), clock, meters); }
    private QualityAsyncService service(QualityTaskQueue queue) {
        return new QualityAsyncService(new QualityRegistration(256, clock, meters), queue,
            new QualityCollectionService(store, clock, "test", "build"), null);
    }
}
