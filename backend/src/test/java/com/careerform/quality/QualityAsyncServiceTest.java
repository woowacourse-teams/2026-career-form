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
            service.observeCaptured(budget -> {
                var captured = new QualityCapturedSnapshot("snapshot", "snapshot", "synthetic.test", List.of(
                    new QualityCapturedSnapshot.Section("section", null, List.of(new QualityCapturedSnapshot.Field("field", "INPUT", "TEXT", "VISIBLE",
                        false, false, false, 0, null)), List.of())), List.of(new QualityCapturedSnapshot.Match("field", true, true)));
                return new QualityObservationCapture(new QualityAsyncService.Observation(connection, "synthetic.test", null, false, "GENERIC", null, "1.0", null,
                    new QualityCollectionService.RequestEvent("FIELDS", 200, 2, null, List.of()), null), captured);
            });
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

    @Test
    void batchWaitsForAllSnapshotsAndLateChunksDoNotReopenCompletedExecution() throws Exception {
        try (var queue = queue()) {
            var service = service(queue);
            var connection = service.connection("a".repeat(32), "b".repeat(64));
            var credentials = service.register(new QualityRegistration.Input("a".repeat(32), "b".repeat(64)));
            var state = new QualityExecution.ClientState(true, true, true, true, null);
            var batch = List.of(new QualityCollectionService.Report("first-event", "first", Map.of("field", state), null),
                new QualityCollectionService.Report("last-event", "last", Map.of("field", state), QualityExecution.Status.COMPLETED));
            service.reportBatch(credentials.runId(), credentials.token(), batch);
            for (var id : List.of("first", "last")) {
                service.observeCaptured(budget -> {
                    var request = new com.careerform.formanalysis.dto.FieldsAnalysisRequest(2, id,
                        new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site("synthetic.test", "/"), List.of(
                        new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section("section", null, null, List.of(
                            new com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate("field",
                                com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                                com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT,
                                com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility.VISIBLE,
                                null, null, null, null, null, null, null, null)), null)));
                    var response = com.careerform.formanalysis.dto.FieldsAnalysisResponse.complete(id, List.of(
                        new com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis("field",
                            com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchType.MATCH, "personal.name",
                            com.careerform.formanalysis.dto.FieldsAnalysisResponse.AutofillPolicy.ALLOWED,
                            com.careerform.formanalysis.dto.FieldsAnalysisResponse.MappingStatus.LLM_SUGGESTED,
                            com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus.READY,
                            new com.careerform.formanalysis.dto.FieldsAnalysisResponse.WritePlan(com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand.SET_TEXT))));
                    return new QualityObservationCapture(new QualityAsyncService.Observation(connection, "synthetic.test", null, false, "GENERIC", null, "1.0", null,
                        new QualityCollectionService.RequestEvent("FIELDS", 200, 2, null, List.of()), null), QualityCapturedSnapshot.from(request, response, budget));
                });
            }
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(3)).until(() -> queue.active() == 0 && queue.waiting() == 0);
            service.reportBatch(credentials.runId(), credentials.token(), batch);
            service.report(credentials.runId(), credentials.token(), new QualityCollectionService.Report("late", "first",
                Map.of("field", new QualityExecution.ClientState(true, false, false, false, null)), QualityExecution.Status.CANCELLED));
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> {
                var execution = ((QualityCollectionService.Run) records.get(credentials.runId()).payload()).execution();
                assertThat(execution.counts().retained()).isEqualTo(2);
                assertThat(execution.events()).hasSize(3);
                assertThat(execution.terminal()).isEqualTo(QualityExecution.Status.COMPLETED);
            });
        }
    }

    @Test
    void rejectedBatchCanBeRetriedAfterQueueCapacityRecovers() throws Exception {
        try (var queue = new QualityTaskQueue(1, 4194304, 131072, Duration.ofSeconds(30), clock, meters)) {
            var service = service(queue);
            var credentials = service.register(new QualityRegistration.Input("a".repeat(32), "b".repeat(64)));
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).until(() -> queue.active() == 0 && queue.waiting() == 0);
            var entered = new CountDownLatch(1);
            var release = new CountDownLatch(1);
            queue.submit(1, () -> { entered.countDown(); release.await(); return true; });
            try {
                assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> service.reportBatch(credentials.runId(), credentials.token(), List.of(report())))
                    .isInstanceOf(QualityAdmissionException.class).satisfies(error -> assertThat(((QualityAdmissionException) error).status()).isEqualTo(429));
            } finally { release.countDown(); }
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).until(() -> queue.active() == 0 && queue.waiting() == 0);
            service.reportBatch(credentials.runId(), credentials.token(), List.of(report()));
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).untilAsserted(() ->
                assertThat(((QualityCollectionService.Run) records.get(credentials.runId()).payload()).execution().events()).hasSize(1));
        }
    }

    @Test
    void largeBatchYieldsTheSingleWorkerBetweenMembers() throws Exception {
        try (var queue = queue()) {
            var service = service(queue);
            var credentials = service.register(new QualityRegistration.Input("a".repeat(32), "b".repeat(64)));
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).until(() -> queue.active() == 0 && queue.waiting() == 0);
            var entered = new CountDownLatch(1);
            var release = new CountDownLatch(1);
            var witness = new java.util.concurrent.CompletableFuture<Integer>();
            queue.submit(1, () -> { entered.countDown(); release.await(); return true; });
            try {
                assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
                service.reportBatch(credentials.runId(), credentials.token(), java.util.stream.IntStream.range(0, 50)
                    .mapToObj(index -> new QualityCollectionService.Report("batch-" + index, null, Map.of(), null)).toList());
                queue.submit(1, () -> {
                    witness.complete(((QualityCollectionService.Run) records.get(credentials.runId()).payload()).execution().events().size());
                    return true;
                });
            } finally { release.countDown(); }
            assertThat(witness.get(2, TimeUnit.SECONDS)).isEqualTo(1);
        }
    }

    @Test
    void unpreparedSnapshotDoesNotBlockOtherMembersOfTheBatch() {
        try (var queue = queue()) {
            var service = service(queue);
            var credentials = service.register(new QualityRegistration.Input("a".repeat(32), "b".repeat(64)));
            service.reportBatch(credentials.runId(), credentials.token(), List.of(
                new QualityCollectionService.Report("missing", "never-ready", Map.of(), null),
                new QualityCollectionService.Report("ready", null, Map.of(), QualityExecution.Status.COMPLETED)));
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).untilAsserted(() ->
                assertThat(((QualityCollectionService.Run) records.get(credentials.runId()).payload()).execution().events())
                    .contains(QualityProjection.digest("ready")).doesNotContain(QualityProjection.digest("missing")));
        }
    }

    @Test
    void serializedEventLimitIsCheckedOnTheWorkerAfterBoundedCapture() {
        try (var queue = queue()) {
            var service = service(queue);
            var fields = java.util.stream.IntStream.range(0, 1200).mapToObj(index ->
                new com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate("c" + index,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility.VISIBLE,
                    null, null, null, null, null, null, null, null)).toList();
            var request = new com.careerform.formanalysis.dto.FieldsAnalysisRequest(2, "snapshot",
                new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site("synthetic.test", "/"), List.of(
                    new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section("section", null, null, fields, null)));
            assertThat(service.observeCaptured(budget -> new QualityObservationCapture(new QualityAsyncService.Observation(null, "synthetic.test", null,
                false, "GENERIC", null, "1.0", null, new QualityCollectionService.RequestEvent("FIELDS", 200, 2, null, List.of()), null),
                QualityCapturedSnapshot.from(request, com.careerform.formanalysis.dto.FieldsAnalysisResponse.complete("snapshot", List.of()), budget)))).isTrue();
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> {
                var rejected = meters.find("quality.tasks").tag("outcome", "rejected").counter();
                assertThat(rejected).isNotNull();
                assertThat(rejected.count()).isEqualTo(1);
                assertThat(queue.retainedBytes()).isZero();
            });
            assertThat(records).isEmpty();
        }
    }

    @Test
    void legacyReportAtTheWireLimitIsNotChargedForAnInternalArrayWrapper() {
        var registration = new QualityRegistration(256, clock, meters);
        var credentials = registration.register(new QualityRegistration.Input("a".repeat(32), "b".repeat(64)), ignored -> true);
        var collector = new QualityCollectionService(store, clock, "test", "build");
        collector.register(credentials.runId(), QualityProjection.digest(credentials.token()), clock.instant());
        registration.prepared(registration.connection("a".repeat(32), "b".repeat(64)), null);
        try (var queue = new QualityTaskQueue(1, 4194304, 88, Duration.ofSeconds(30), clock, meters)) {
            var service = new QualityAsyncService(registration, queue, collector, null);
            service.report(credentials.runId(), credentials.token(), report());
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).untilAsserted(() ->
                assertThat(((QualityCollectionService.Run) records.get(credentials.runId()).payload()).execution().events()).hasSize(1));
        }
    }

    private QualityCollectionService.Report report() { return new QualityCollectionService.Report("event", null, Map.of(), QualityExecution.Status.COMPLETED); }
    private QualityTaskQueue queue() { return new QualityTaskQueue(64, 4194304, 131072, Duration.ofSeconds(30), clock, meters); }
    private QualityAsyncService service(QualityTaskQueue queue) {
        return new QualityAsyncService(new QualityRegistration(256, clock, meters), queue,
            new QualityCollectionService(store, clock, "test", "build"), null);
    }
}
