package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

class QualityRepairTest {
    @Test
    void repairsDerivedRecordsWithoutResettingOriginalWaitingTime() {
        var now = Instant.parse("2030-01-02T00:00:00Z");
        var created = now.minusSeconds(86400);
        var records = new java.util.HashMap<String, QualityRecord>();
        var store = mock(QualityStore.class);
        when(store.find(any(), any())).thenAnswer(call -> Optional.ofNullable(records.get(call.getArgument(0))));
        when(store.insert(any())).thenAnswer(call -> { QualityRecord record = call.getArgument(0); return records.putIfAbsent(record.id(), record) == null; });
        when(store.replace(any(), any())).thenAnswer(call -> { QualityRecord before = call.getArgument(0); return records.replace(before.id(), before, call.getArgument(1)); });
        var group = new QualityRecord.Group("test", "site.test", "shape", "GENERIC", "v1");
        var source = new QualityRecord("request", QualityRecord.Kind.REQUEST, group, 0, created, now.plusSeconds(29 * 86400),
            new QualityCollectionService.RequestEvent("FIELDS", 200, 50, new QualityMetrics.Counts(1, 1, 0, 0, 0, 0), List.of()));
        when(store.list(any(), any())).thenAnswer(call -> {
            QualityStore.Query query = call.getArgument(0);
            return query.kind() == QualityRecord.Kind.REQUEST && query.offset() == 0 ? List.of(source) : List.of();
        });
        var clock = Clock.fixed(now, ZoneOffset.UTC);
        var registry = new QualityRegistry(store, clock, "test");
        var repair = new QualityRepair(store, registry, new QualityRollup(store, registry, clock), clock, "test");
        assertThat(repair.repair().failed()).isZero();
        assertThat(records.values().stream().filter(record -> record.kind() == QualityRecord.Kind.CANDIDATE)).singleElement()
            .satisfies(record -> assertThat(((QualityRegistry.Candidate) record.payload()).firstSeen()).isEqualTo(created));
        repair.repair();
        assertThat(records.values().stream().filter(record -> record.kind() == QualityRecord.Kind.AGGREGATE)).singleElement()
            .satisfies(record -> assertThat(((QualityDailyAggregate) record.payload()).requests()).isEqualTo(1));
    }
}
