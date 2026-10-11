package com.careerform.quality;

import java.time.Clock;
import java.util.List;

public final class QualityRepair {
    private final QualityStore store;
    private final QualityRegistry registry;
    private final QualityRollup rollup;
    private final Clock clock;
    private final String environment;

    public QualityRepair(QualityStore store, QualityRegistry registry, QualityRollup rollup, Clock clock, String environment) {
        this.store = store; this.registry = registry; this.rollup = rollup; this.clock = clock; this.environment = environment;
    }

    public record Result(long observed, long failed) { }

    public Result repair() {
        var now = clock.instant();
        long observed = 0;
        long failed = 0;
        for (var kind : List.of(QualityRecord.Kind.REQUEST, QualityRecord.Kind.EXECUTION)) {
            for (long offset = 0; ; offset += 1000) {
                var records = store.list(new QualityStore.Query(kind, environment, null, null, null, now.minusSeconds(30L * 86400), null, offset, 1000), now);
                for (var record : records) {
                    observed++;
                    try {
                        if (kind == QualityRecord.Kind.REQUEST && ((QualityCollectionService.RequestEvent) record.payload()).counts() != null
                            && !record.group().structure().equals("UNKNOWN")) { registry.observe(record.group(), record.createdAt()); }
                        rollup.observe(record);
                    } catch (RuntimeException exception) { failed++; }
                }
                if (records.size() < 1000) { break; }
            }
        }
        if (failed > 0) { org.slf4j.LoggerFactory.getLogger(QualityRepair.class).warn("QUALITY_REPAIR_INCOMPLETE count={}", failed); }
        return new Result(observed, failed);
    }
}
