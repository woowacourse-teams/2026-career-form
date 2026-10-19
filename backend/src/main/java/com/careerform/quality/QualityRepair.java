package com.careerform.quality;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

public final class QualityRepair {
    private final QualityStore store;
    private final QualityRegistry registry;
    private final QualityRollup rollup;
    private final Clock clock;
    private final String environment;
    private final int batchSize;
    private final long budgetNanos;
    private int kindIndex;
    private long offset;
    private Instant ceiling;

    public QualityRepair(QualityStore store, QualityRegistry registry, QualityRollup rollup, Clock clock, String environment) {
        this(store, registry, rollup, clock, environment, 16, Duration.ofSeconds(1));
    }

    public QualityRepair(QualityStore store, QualityRegistry registry, QualityRollup rollup, Clock clock, String environment,
                         int batchSize, Duration budget) {
        if (batchSize < 1 || batchSize > 1000 || budget.isNegative() || budget.isZero()) {
            throw new IllegalArgumentException("Invalid quality repair limits");
        }
        this.store = store; this.registry = registry; this.rollup = rollup; this.clock = clock; this.environment = environment;
        this.batchSize = batchSize;
        this.budgetNanos = budget.toNanos();
    }

    public record Result(long observed, long failed) { }

    public synchronized Result repair() {
        var now = clock.instant();
        if (ceiling == null) { ceiling = now; }
        var started = System.nanoTime();
        long observed = 0;
        long failed = 0;
        var kinds = List.of(QualityRecord.Kind.REQUEST, QualityRecord.Kind.EXECUTION);
        while (observed < batchSize && System.nanoTime() - started < budgetNanos) {
            var kind = kinds.get(kindIndex);
            var limit = Math.toIntExact(batchSize - observed);
            var records = store.list(new QualityStore.Query(kind, environment, null, null, null,
                ceiling.minusSeconds(30L * 86400), ceiling.plusNanos(1), offset, limit), now);
            var processed = 0;
            for (var record : records) {
                if (System.nanoTime() - started >= budgetNanos) { break; }
                observed++;
                processed++;
                try {
                    if (kind == QualityRecord.Kind.REQUEST && ((QualityCollectionService.RequestEvent) record.payload()).counts() != null
                        && !record.group().structure().equals("UNKNOWN")) { registry.observe(record.group(), record.createdAt()); }
                    rollup.observe(record);
                } catch (RuntimeException exception) { failed++; }
            }
            offset += processed;
            if (processed < records.size()) { break; }
            if (records.size() < limit) {
                offset = 0;
                kindIndex++;
                if (kindIndex == kinds.size()) {
                    kindIndex = 0;
                    ceiling = null;
                    break;
                }
            }
        }
        if (failed > 0) { org.slf4j.LoggerFactory.getLogger(QualityRepair.class).warn("QUALITY_REPAIR_INCOMPLETE count={}", failed); }
        return new Result(observed, failed);
    }
}
