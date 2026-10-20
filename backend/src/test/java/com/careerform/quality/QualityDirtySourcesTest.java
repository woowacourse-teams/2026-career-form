package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class QualityDirtySourcesTest {
    private final Instant now = Instant.parse("2030-01-01T00:00:00Z");

    @Test
    void keepsChangesMadeDuringAggregationAndCoalescesSameSource() {
        var dirty = dirty(2);
        assertThat(dirty.mark(record("first", 0))).isTrue();
        assertThat(dirty.mark(record("first", 1))).isTrue();
        dirty.flush(1, id -> {
            assertThat(id).isEqualTo("first");
            dirty.mark(record("first", 2));
            return true;
        });
        assertThat(dirty.size()).isEqualTo(1);
        var processed = new ArrayList<String>();
        dirty.flush(1, id -> { processed.add(id); return true; });
        assertThat(processed).containsExactly("first");
        assertThat(dirty.size()).isZero();
    }

    @Test
    void rejectsOverflowAndBoundsEachBatchAndFailedRetries() {
        var dirty = dirty(2);
        assertThat(dirty.mark(record("first", 0))).isTrue();
        assertThat(dirty.mark(record("second", 0))).isTrue();
        assertThat(dirty.mark(record("third", 0))).isFalse();
        var processed = new ArrayList<String>();
        dirty.flush(1, id -> { processed.add(id); return false; });
        assertThat(processed).hasSize(1);
        dirty.flush(1, id -> false);
        assertThat(dirty.size()).isEqualTo(1);
        dirty.flush(1, id -> true);
        assertThat(dirty.size()).isZero();
    }

    @Test
    void expiresRetainedIdentifiersWithoutLoadingDatabaseRecords() {
        var time = new java.util.concurrent.atomic.AtomicReference<>(now);
        var clock = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return time.get(); }
        };
        var dirty = new QualityDirtySources(2, Duration.ofMinutes(1), 2, clock, new SimpleMeterRegistry());
        dirty.mark(record("first", 0));
        time.set(now.plusSeconds(60));
        dirty.flush(1, id -> { throw new AssertionError("expired source must not be loaded"); });
        assertThat(dirty.size()).isZero();
    }

    private QualityDirtySources dirty(int capacity) {
        return new QualityDirtySources(capacity, Duration.ofDays(1), 2, Clock.fixed(now, ZoneOffset.UTC), new SimpleMeterRegistry());
    }

    private QualityRecord record(String id, long revision) {
        return new QualityRecord(id, QualityRecord.Kind.REQUEST,
            new QualityRecord.Group("test", "synthetic.test", "shape", "GENERIC", "build"), revision, now, now.plusSeconds(86400),
            new QualityCollectionService.RequestEvent("FIELDS", 200, 1, null, List.of()));
    }
}
