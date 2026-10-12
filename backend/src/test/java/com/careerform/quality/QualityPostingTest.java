package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

class QualityPostingTest {
    private final Instant now = Instant.parse("2030-01-01T00:00:00Z");
    private final java.util.Map<String, QualityRecord> records = new java.util.concurrent.ConcurrentHashMap<>();
    private final QualityStore store = new QualityStore() {
        public boolean insert(QualityRecord record) { return records.putIfAbsent(record.id(), record) == null; }
        public Optional<QualityRecord> find(String id, Instant time) { return Optional.ofNullable(records.get(id)); }
        public boolean replace(QualityRecord previous, QualityRecord next) { return records.replace(previous.id(), previous, next); }
        public List<QualityRecord> list(Query query, Instant time) {
            return records.values().stream().filter(record -> record.kind() == query.kind())
                .filter(record -> record.group().environment().equals(query.environment())).toList();
        }
    };
    private final QualityRegistry registry = new QualityRegistry(store, Clock.fixed(now, ZoneOffset.UTC), "test");
    private final String host = "fixture.career.greetinghr.com";
    private final String url = "https://" + host + "/ko/o/238112/apply";

    private QualityRecord.Group group(String shape) {
        return new QualityRecord.Group("test", host, shape, "GREETING", "fixture", host, QualitySite.Status.TENANT);
    }

    @Test
    void providesOneConfirmationForDifferentStatesOfOnePosting() {
        registry.observe(group("visible"), now, url);
        registry.observe(group("expanded"), now.plusSeconds(1), url);
        var site = QualityCandidateGroups.all(registry).getFirst();
        assertThat(site.candidates()).hasSize(1);
        assertThat(registry.listRecords(null, 0, 100)).hasSize(2);
    }

    @Test
    void keepsPostingCompletedWhenAnotherStructureAppears() {
        registry.observe(group("visible"), now, url);
        var first = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        registry.confirm(first.id(), "owner", 52, url);
        registry.observe(group("expanded"), now.plusSeconds(1), url);
        var site = QualityCandidateGroups.all(registry).getFirst();
        assertThat(site.completed(now.plusSeconds(2))).isTrue();
        assertThat(site.candidates()).hasSize(1);
        assertThat(registry.candidate(first.id()).history()).hasSize(1);
    }

    @Test
    void preservesLegacyHistoryWithoutSilentlyInheritingAnUnknownBaseline() {
        var old = registry.observe(group("old"));
        registry.confirm(old.id(), "owner", 52, url);
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        assertThat(((QualityRegistry.Candidate) posting.payload()).status()).isEqualTo(QualityRegistry.Status.WAITING);
        assertThat(registry.candidate(old.id()).history()).hasSize(1);
    }

    @Test
    void protectsPostingOwnershipAndRequiresItsExactUrl() {
        registry.observe(group("shape"), now, url);
        var id = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst().id();
        registry.claim(id, "first", "확인자");
        assertThatThrownBy(() -> registry.confirm(id, "other", 52, url)).isInstanceOf(QualityRegistry.Conflict.class);
        assertThatThrownBy(() -> registry.confirm(id, "first", 52, "https://" + host + "/ko/o/238113/apply"))
            .isInstanceOf(IllegalArgumentException.class);
        registry.confirm(id, "first", 52, url);
        assertThat(registry.candidate(id).history().getLast().toString()).contains("확인자");
        registry.reopen(id, "first");
        assertThat(registry.candidate(id).status()).isEqualTo(QualityRegistry.Status.WAITING);
        assertThat(registry.candidate(id).history()).hasSize(1);
    }

    @Test
    void doesNotInventPostingForUnsafeUrlOrMergeEnvironments() {
        registry.observe(group("shape"), now, url + "?session=synthetic");
        assertThat(QualityCandidateGroups.all(registry).getFirst().candidates().getFirst().kind()).isEqualTo(QualityRecord.Kind.CANDIDATE);
        registry.observe(group("shape"), now, url);
        var other = new QualityRegistry(store, Clock.fixed(now, ZoneOffset.UTC), "other");
        other.observe(new QualityRecord.Group("other", host, "shape", "GREETING", "fixture", host, QualitySite.Status.TENANT), now, url);
        assertThat(QualityCandidateGroups.all(registry).getFirst().candidates().getFirst().id())
            .isNotEqualTo(QualityCandidateGroups.all(other).getFirst().candidates().getFirst().id());
    }

    @Test
    void usesPostingConfirmationWithoutCopyingItIntoObservationHistory() {
        var source = registry.observe(group("shape"), now, url);
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        registry.confirm(posting.id(), "owner", 52, url);
        assertThat(registry.reference(group("shape"), now.plusSeconds(1))).contains(52L);
        assertThat(registry.candidate(source.id()).history()).isEmpty();
    }

    @Test
    void appliesBaselineOnlyWhenObservedScopeMatchesAndRowsAreSingular() {
        registry.observe(group("baseline"), now, url);
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        registry.confirm(posting.id(), "owner", 52, url);
        var baseline = new QualityCollectionService.SnapshotLink(group("baseline"), java.util.Map.of(), java.util.Map.of(), true,
            posting.id(), new QualityProjection.Baseline(52, true));
        assertThat(registry.executionReference(group("baseline"), now.plusSeconds(1), List.of(baseline)).compatible()).isTrue();
        var repeated = new QualityCollectionService.SnapshotLink(group("repeated"), java.util.Map.of(), java.util.Map.of(), true,
            posting.id(), new QualityProjection.Baseline(80, false));
        var partial = new QualityCollectionService.SnapshotLink(group("partial"), java.util.Map.of(), java.util.Map.of(), true,
            posting.id(), new QualityProjection.Baseline(20, true));
        assertThat(registry.executionReference(group("repeated"), now.plusSeconds(2), List.of(repeated)).compatible()).isFalse();
        assertThat(registry.executionReference(group("partial"), now.plusSeconds(2), List.of(partial)).compatible()).isFalse();
        assertThat(registry.candidate(posting.id()).status()).isEqualTo(QualityRegistry.Status.COMPLETED);
    }

    @Test
    void reopeningPostingDoesNotRestoreOldStructureReference() {
        var source = registry.observe(group("legacy"), now, url);
        registry.confirm(source.id(), "old", 9, url);
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        registry.confirm(posting.id(), "owner", 52, url);
        registry.reopen(posting.id(), "owner");
        assertThat(registry.reference(group("legacy"), now.plusSeconds(1))).isEmpty();
    }

    @Test
    void respectsAnExistingLegacyClaimWhileOfferingPostingConfirmation() {
        var old = registry.observe(group("claimed"), now, url);
        registry.claim(old.id(), "previous", "기존 담당자");
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        assertThatThrownBy(() -> registry.claim(posting.id(), "other")).isInstanceOf(QualityRegistry.Conflict.class);
        assertThatThrownBy(() -> registry.confirm(posting.id(), "other", 52, url)).isInstanceOf(QualityRegistry.Conflict.class);
        registry.confirm(posting.id(), "previous", 52, url);
        assertThat(registry.candidate(old.id()).claimedAt(now)).isTrue();
    }

    @Test
    void preventsLegacyClientFromTakingAnAlreadyClaimedPosting() {
        var old = registry.observe(group("legacy-client"), now, url);
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        registry.claim(posting.id(), "current");
        assertThatThrownBy(() -> registry.claim(old.id(), "legacy")).isInstanceOf(QualityRegistry.Conflict.class);
        assertThatThrownBy(() -> registry.confirm(old.id(), "legacy", 52, url)).isInstanceOf(QualityRegistry.Conflict.class);
        registry.claim(old.id(), "current");
    }

    @Test
    void doesNotRequeueUnlinkedHistoryAfterPostingIsConfirmed() {
        registry.observe(group("unlinked"));
        registry.observe(group("linked"), now, url);
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().stream()
            .filter(record -> record.kind() == QualityRecord.Kind.POSTING).findFirst().orElseThrow();
        registry.confirm(posting.id(), "owner", 52, url);
        assertThat(QualityCandidateGroups.all(registry).getFirst().completed(now)).isTrue();
        assertThat(QualityCandidateGroups.selection(registry.workRecords(), now)).isEmpty();
    }

    @Test
    void countsLegacyAssignmentsOnceAndReleasesTheirCapacityAfterPostingCompletion() {
        for (var shape : List.of("a", "b", "c")) {
            var old = registry.observe(group(shape), now, url);
            registry.claim(old.id(), "owner");
        }
        assertThat(registry.assignedCount()).isEqualTo(3);
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        registry.claim(posting.id(), "owner");
        assertThat(registry.assignedCount()).isEqualTo(3);
        registry.observe(group("independent"), now, "https://" + host + "/ko/o/238113/apply");
        var other = registry.workRecords().stream().filter(record -> record.kind() == QualityRecord.Kind.POSTING && !record.id().equals(posting.id())).findFirst().orElseThrow();
        registry.claim(other.id(), "other");
        assertThat(registry.assignedCount()).isEqualTo(4);
        registry.confirm(posting.id(), "owner", 52, url);
        registry.release(other.id(), "other");
        assertThat(registry.assignedCount()).isZero();
    }

    @Test
    void doesNotApplyKnownPostingToAnExecutionWithoutItsPublicLink() {
        var scope = group("baseline");
        registry.observe(scope, now, url);
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        registry.confirm(posting.id(), "owner", 1, url);
        var clock = Clock.fixed(now.plusSeconds(1), ZoneOffset.UTC);
        var collector = new QualityCollectionService(store, clock, "test", "fixture", new QualityRollup(store, registry, clock), registry);
        var snapshot = new QualityProjection.Snapshot("snapshot", host, "baseline",
            List.of(new QualityProjection.Field("f1", "0", "TEXT", true, true)), new QualityProjection.Baseline(1, true));
        var event = new QualityCollectionService.RequestEvent("FIELDS", 200, 1, snapshot.counts(), List.of());
        var receipt = collector.observe(scope, event, snapshot, null, null, true);
        var contribution = records.values().stream().filter(record -> record.kind() == QualityRecord.Kind.AGGREGATE)
            .map(record -> (QualityDailyAggregate) record.payload())
            .map(bucket -> bucket.contributions().get("EXECUTION_" + QualityProjection.digest(receipt.runId())))
            .filter(java.util.Objects::nonNull).findFirst().orElseThrow();
        assertThat(contribution.referenceStatus()).isEqualTo(QualityMetrics.CoverageStatus.UNREGISTERED);
    }

    @Test
    void releasesPostingAndItsLegacyClaimsTogether() {
        var old = registry.observe(group("claimed"), now, url);
        registry.claim(old.id(), "owner");
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        registry.release(posting.id(), "owner");
        assertThat(registry.assignedCount()).isZero();
        assertThat(registry.candidate(old.id()).claimedAt(now)).isFalse();
    }

    @Test
    void onlyOneConcurrentClaimantCanOwnPosting() throws Exception {
        registry.observe(group("shape"), now, url);
        var id = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst().id();
        var ready = new java.util.concurrent.CyclicBarrier(2);
        var won = new java.util.concurrent.atomic.AtomicInteger();
        var rejected = new java.util.concurrent.atomic.AtomicInteger();
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var tasks = List.of("first", "second").stream().map(owner -> (java.util.concurrent.Callable<Void>) () -> {
                ready.await();
                try { registry.claim(id, owner); won.incrementAndGet(); }
                catch (QualityRegistry.Conflict conflict) { rejected.incrementAndGet(); }
                return null;
            }).toList();
            for (var task : executor.invokeAll(tasks)) { task.get(); }
        }
        assertThat(won.get()).isEqualTo(1);
        assertThat(rejected.get()).isEqualTo(1);
    }

    @Test
    void bindsReferenceToExecutionPostingAndKeepsBaselineAcrossCorrespondence() {
        var scope = group("baseline");
        registry.observe(scope, now, url);
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        registry.confirm(posting.id(), "owner", 1, url);
        var clock = Clock.fixed(now.plusSeconds(1), ZoneOffset.UTC);
        var collector = new QualityCollectionService(store, clock, "test", "fixture", new QualityRollup(store, registry, clock), registry);
        var snapshot = new QualityProjection.Snapshot(QualityProjection.digest("snapshot"), host, "baseline",
            List.of(new QualityProjection.Field(QualityProjection.digest("snapshot|field-1"), "0", "TEXT", true, true)), new QualityProjection.Baseline(1, true));
        var event = new QualityCollectionService.RequestEvent("FIELDS", 200, 1, snapshot.counts(), List.of());
        var receipt = collector.observe(scope, event, snapshot, null, null, true, url);
        collector.report(receipt.runId(), receipt.token(), new QualityCollectionService.Report("event", "snapshot", java.util.Map.of(),
            null, java.util.Map.of("field-1", "e1")));
        var run = (QualityCollectionService.Run) records.get(receipt.runId()).payload();
        var link = run.snapshots().get(snapshot.snapshotKey());
        assertThat(link.identityVerified()).isTrue();
        assertThat(link.postingId()).isEqualTo(posting.id());
        assertThat(link.baseline()).isEqualTo(snapshot.baseline());
        assertThat(registry.executionReference(scope, clock.instant(), List.of(link))).isEqualTo(new QualityRegistry.Reference(1L, true));
        var repeated = new QualityCollectionService.SnapshotLink(scope, link.aliases(), link.controls(), true, posting.id(), new QualityProjection.Baseline(2, false));
        assertThat(registry.executionReference(scope, clock.instant(), List.of(repeated))).isEqualTo(new QualityRegistry.Reference(1L, false));
        var unknown = new QualityCollectionService.SnapshotLink(scope, link.aliases(), link.controls(), true);
        assertThat(registry.executionReference(scope, clock.instant(), List.of(link, unknown)).compatible()).isFalse();
    }

    @Test
    void preservesLegacyRequestAndDefersItWithPosting() {
        var old = registry.observe(group("requested"), now, url);
        registry.request(old.id());
        var posting = QualityCandidateGroups.all(registry).getFirst().candidates().getFirst();
        assertThat(((QualityRegistry.Candidate) posting.payload()).statusAt(now)).isEqualTo(QualityRegistry.Status.REQUESTED);
        registry.defer(posting.id(), "owner", QualityRegistry.DeferReason.TIME_REQUIRED, null);
        assertThat(registry.assignedCount()).isZero();
        assertThat(((QualityRegistry.Candidate) QualityCandidateGroups.all(registry).getFirst().candidates().getFirst().payload()).statusAt(now))
            .isEqualTo(QualityRegistry.Status.DEFERRED);
    }

    @Test
    void separatesDifferentPostingsInTheSameSite() {
        registry.observe(group("visible"), now, url);
        registry.observe(group("visible"), now.plusSeconds(1), "https://" + host + "/ko/o/238113/apply");
        assertThat(QualityCandidateGroups.all(registry).getFirst().candidates()).hasSize(2);
    }
}
