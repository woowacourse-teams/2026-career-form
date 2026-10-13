package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.mongodb.core.MongoTemplate;

import com.mongodb.client.MongoClients;

@EnabledIfEnvironmentVariable(named = "QUALITY_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+")
@DisplayName("상세 만료 뒤에도 유지되는 Mongo 일별 품질 집계")
class QualityRollupPersistenceTest {
    @Test
    void preservesDailyCountsAndReplacesLateResults() {
        try (var client = MongoClients.create(System.getenv("QUALITY_TEST_MONGO_URI"))) {
            var mongo = new MongoTemplate(client, "cf164_test_" + UUID.randomUUID().toString().replace("-", ""));
            var store = new MongoQualityStore(mongo);
            store.ensureIndexes();
            var now = Instant.parse("2030-01-01T00:00:00Z");
            var clock = Clock.fixed(now, ZoneOffset.UTC);
            var registry = new QualityRegistry(store, clock, "test");
            var rollup = new QualityRollup(store, registry, clock);
            var collector = new QualityCollectionService(store, clock, "test", "build", rollup, registry);
            var group = new QualityRecord.Group("test", "example.test", "shape", "GENERIC", "build");
            var snapshot = new QualityProjection.Snapshot(QualityProjection.digest("snapshot"), "example.test", "shape",
                List.of(new QualityProjection.Field(QualityProjection.digest("snapshot|field"), "0", "TEXT", true, true)));
            var receipt = collector.observe(group, new QualityCollectionService.RequestEvent("FIELDS", 200, 20, snapshot.counts(), List.of()),
                snapshot, null, null, true);
            var report = new QualityCollectionService.Report("event", "snapshot",
                Map.of("field", new QualityExecution.ClientState(true, true, true, true, null)), QualityExecution.Status.COMPLETED);
            collector.report(receipt.runId(), receipt.token(), report);
            collector.report(receipt.runId(), receipt.token(), report);

            var later = now.plusSeconds(31 * 86400L);
            assertThat(store.find(receipt.runId(), later)).isEmpty();
            var records = store.list(new QualityStore.Query(QualityRecord.Kind.AGGREGATE, "test", null, null, null, null, null, 0, 100), later);
            assertThat(records).hasSize(1);
            var aggregate = (QualityDailyAggregate) records.getFirst().payload();
            assertThat(aggregate.requests()).isEqualTo(1);
            assertThat(aggregate.executions()).isEqualTo(1);
            assertThat(aggregate.executionCounts()).isEqualTo(new QualityMetrics.Counts(1, 1, 1, 1, 1, 1));
            assertThat(aggregate.missing(later)).isZero();
            assertThat(store.list(new QualityStore.Query(QualityRecord.Kind.AGGREGATE, "test", null, null, null, null, null, 0, 100), now.plusSeconds(90 * 86400L))).isEmpty();
        }
    }
}
