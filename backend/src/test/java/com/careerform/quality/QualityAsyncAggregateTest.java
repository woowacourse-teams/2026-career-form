package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class QualityAsyncAggregateTest {
    @Test
    void persistsSourcesWithoutAggregatingAndFlushesLatestExecutionOnScheduledWork() {
        var records = new ConcurrentHashMap<String, QualityRecord>();
        var store = new QualityStore() {
            public boolean insert(QualityRecord value) { return records.putIfAbsent(value.id(), value) == null; }
            public Optional<QualityRecord> find(String id, Instant now) { return Optional.ofNullable(records.get(id)); }
            public boolean replace(QualityRecord before, QualityRecord next) { return records.replace(before.id(), before, next); }
            public List<QualityRecord> list(Query query, Instant now) { return records.values().stream().filter(record -> record.kind() == query.kind()).toList(); }
        };
        var clock = Clock.systemUTC();
        var meters = new SimpleMeterRegistry();
        var dirty = new QualityDirtySources(64, Duration.ofDays(1), 3, clock, meters);
        var registry = new QualityRegistry(store, clock, "test");
        var rollup = new QualityRollup(store, registry, clock);
        var collector = new QualityCollectionService(store, clock, "test", "build", rollup, registry, dirty);
        var run = "a".repeat(32);
        var hash = "b".repeat(64);
        collector.register(run, hash, clock.instant());
        collector.observeRegistered(collector.group("synthetic.test", "shape", "GENERIC", null, null),
            new QualityCollectionService.RequestEvent("FIELDS", 200, 1, null, List.of()), null, run, hash, null);
        collector.reportRegistered(run, hash, new QualityCollectionService.Report("event", null, Map.of(), QualityExecution.Status.COMPLETED));
        assertThat(records.values()).noneMatch(record -> record.kind() == QualityRecord.Kind.AGGREGATE);
        assertThat(dirty.size()).isEqualTo(2);
        try (var tasks = new QualityTaskQueue(64, 4194304, 131072, Duration.ofSeconds(30), clock, meters)) {
            var schedule = new QualitySchedule(org.mockito.Mockito.mock(QualityDailyBatch.class), org.mockito.Mockito.mock(QualityRepair.class), tasks, dirty, store, rollup, 64);
            schedule.aggregate();
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(3)).until(() -> tasks.active() == 0 && tasks.waiting() == 0);
            assertThat(dirty.size()).isZero();
            assertThat(records.values().stream().filter(record -> record.kind() == QualityRecord.Kind.AGGREGATE)).singleElement()
                .satisfies(record -> {
                    var aggregate = (QualityDailyAggregate) record.payload();
                    assertThat(aggregate.requests()).isEqualTo(1);
                    assertThat(aggregate.executions()).isEqualTo(1);
                });
        }
    }
}
