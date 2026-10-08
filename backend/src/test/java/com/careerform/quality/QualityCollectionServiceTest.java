package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("요청 관측과 실제 입력 보고의 분리")
class QualityCollectionServiceTest {
    private final Instant now = Instant.parse("2030-01-01T00:00:00Z");
    private final Map<String, QualityRecord> records = new HashMap<>();
    private final QualityStore store = new QualityStore() {
        public boolean insert(QualityRecord record) { return records.putIfAbsent(record.id(), record) == null; }
        public Optional<QualityRecord> find(String id, Instant time) {
            return Optional.ofNullable(records.get(id)).filter(record -> record.expiresAt() == null || record.expiresAt().isAfter(time));
        }
        public boolean replace(QualityRecord previous, QualityRecord next) { return records.replace(previous.id(), previous, next); }
        public List<QualityRecord> list(Query query, Instant time) { return List.copyOf(records.values()); }
    };
    private final QualityCollectionService service = new QualityCollectionService(store, Clock.fixed(now, ZoneOffset.UTC), "test", "build-test");
    private final QualityRecord.Group group = new QualityRecord.Group("test", "example.test", "shape", "GENERIC", "build-test");
    private final QualityProjection.Snapshot snapshot = new QualityProjection.Snapshot(
        QualityProjection.digest("snapshot"), "example.test", "shape", List.of(
            new QualityProjection.Field(QualityProjection.digest("snapshot|candidate"), "0", "TEXT", true, true)));

    @Test
    @DisplayName("구형 확장의 요청은 수집하지만 실행 건수를 추정하지 않는다")
    void observesLegacyRequestWithoutInventingExecution() {
        assertThat(service.observe(group, new QualityCollectionService.RequestEvent("FIELDS", 200, 12,
            snapshot.counts(), List.of()), snapshot, null, null, false)).isNull();
        assertThat(records.values()).extracting(QualityRecord::kind).containsExactly(QualityRecord.Kind.REQUEST);
    }

    @Test
    @DisplayName("실행 토큰은 해시로 저장하고 관측 후보의 단계만 보고받는다")
    void reportsOnlyOwnedCandidatesWithOpaqueToken() {
        var receipt = observe(null, null);
        assertThat(receipt.runId()).isNotBlank();
        assertThat(records.values().stream().filter(record -> record.kind() == QualityRecord.Kind.REQUEST)
            .map(record -> (QualityCollectionService.RequestEvent) record.payload())).allSatisfy(request -> {
                assertThat(request.runId()).isEqualTo(receipt.runId());
                assertThat(request.snapshotKey()).isEqualTo(QualityProjection.digest("snapshot"));
            });
        assertThat(records.toString()).doesNotContain(receipt.token());
        service.report(receipt.runId(), receipt.token(), new QualityCollectionService.Report("event1", "snapshot",
            Map.of("candidate", new QualityExecution.ClientState(true, true, true, true, null)), QualityExecution.Status.COMPLETED));
        var run = (QualityCollectionService.Run) records.get(receipt.runId()).payload();
        assertThat(run.execution().counts()).isEqualTo(new QualityMetrics.Counts(1, 1, 1, 1, 1, 1));
        assertThatThrownBy(() -> service.report(receipt.runId(), "incorrect", new QualityCollectionService.Report("event2", "snapshot",
            Map.of(), null))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.report(receipt.runId(), receipt.token(), new QualityCollectionService.Report("event3", "snapshot",
            Map.of("foreign", new QualityExecution.ClientState(false, false, false, false, null)), null)))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("재분석은 요청만 늘리고 같은 구조의 후보는 실행에서 중복 집계하지 않는다")
    void joinsReanalysisWithoutDoubleCountingFields() {
        var receipt = observe(null, null);
        var second = observe(receipt.runId(), receipt.token());
        assertThat(second).isEqualTo(receipt);
        assertThat(records.values().stream().filter(record -> record.kind() == QualityRecord.Kind.REQUEST)).hasSize(2);
        assertThat(records.values().stream().filter(record -> record.kind() == QualityRecord.Kind.EXECUTION)).hasSize(1);
        assertThat(((QualityCollectionService.Run) records.get(receipt.runId()).payload()).execution().counts().discovered()).isEqualTo(1);
    }

    @Test
    @DisplayName("다른 사이트와 만료한 토큰으로 실행을 연결하지 않는다")
    void rejectsForeignSiteAndExpiredReceipt() {
        var receipt = observe(null, null);
        var foreign = new QualityRecord.Group("test", "foreign.test", "shape", "GENERIC", "build-test");
        assertThatThrownBy(() -> service.observe(foreign, new QualityCollectionService.RequestEvent("FIELDS", 200, 1, snapshot.counts(), List.of()),
            snapshot, receipt.runId(), receipt.token(), true)).isInstanceOf(IllegalArgumentException.class);
        var later = new QualityCollectionService(store, Clock.fixed(now.plusSeconds(86400), ZoneOffset.UTC), "test", "build-test");
        assertThatThrownBy(() -> later.report(receipt.runId(), receipt.token(), new QualityCollectionService.Report("event", "snapshot", Map.of(), null)))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsArbitraryTextInClientVersionMetadata() {
        assertThat(service.group("example.test", "shape", "GENERIC", null, "synthetic-private-name").version())
            .contains("extension=UNKNOWN").doesNotContain("synthetic-private-name");
        assertThat(service.group("example.test", "shape", "GENERIC", null, "0.1.0").version()).contains("extension=0.1.0");
    }

    @Test
    void deduplicatesOnlyWhenLocalControlCorrespondenceWasReported() {
        var receipt = observe(null, null);
        service.report(receipt.runId(), receipt.token(), new QualityCollectionService.Report("identity1", "snapshot", Map.of(), null, Map.of("candidate", "e1")));
        var second = new QualityProjection.Snapshot(QualityProjection.digest("second"), "example.test", "shape", List.of(
            new QualityProjection.Field(QualityProjection.digest("second|other"), "0", "TEXT", true, true)));
        service.observe(group, new QualityCollectionService.RequestEvent("FIELDS", 200, 10, second.counts(), List.of()), second, receipt.runId(), receipt.token(), true);
        service.report(receipt.runId(), receipt.token(), new QualityCollectionService.Report("identity2", "second", Map.of(), null, Map.of("other", "e1")));
        assertThat(((QualityCollectionService.Run) records.get(receipt.runId()).payload()).execution().counts().discovered()).isEqualTo(1);
        assertThatThrownBy(() -> service.report(receipt.runId(), receipt.token(), new QualityCollectionService.Report("identity3", "second", Map.of(), null,
            Map.of("other", "e2")))).isInstanceOf(IllegalArgumentException.class);
    }

    private QualityCollectionService.Receipt observe(String id, String token) {
        return service.observe(group, new QualityCollectionService.RequestEvent("FIELDS", 200, 10, snapshot.counts(), List.of()),
            snapshot, id, token, true);
    }

    @Test
    void rejectedIncompleteReceiptStillRecordsAnalysisRequest() {
        assertThatThrownBy(() -> observe(null, "synthetic-invalid-token")).isInstanceOf(IllegalArgumentException.class);
        assertThat(records.values()).filteredOn(record -> record.kind() == QualityRecord.Kind.REQUEST).hasSize(1)
            .allSatisfy(record -> {
                var event = (QualityCollectionService.RequestEvent) record.payload();
                assertThat(event.linkage()).isEqualTo("REJECTED");
                assertThat(event.runId()).isNull();
            });
        assertThat(records.toString()).doesNotContain("synthetic-invalid-token");
    }

    @Test
    void duplicateEventCannotChangeControlCorrespondence() {
        var receipt = observe(null, null);
        service.report(receipt.runId(), receipt.token(), new QualityCollectionService.Report("same-event", "snapshot", Map.of(), null));
        var previous = records.get(receipt.runId());
        service.report(receipt.runId(), receipt.token(), new QualityCollectionService.Report("same-event", "snapshot", Map.of(), null, Map.of("candidate", "e1")));
        assertThat(records.get(receipt.runId())).isEqualTo(previous);
    }
}
