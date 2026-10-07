package com.careerform.quality;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface QualityStore {
    boolean insert(QualityRecord record);

    Optional<QualityRecord> find(String id, Instant now);

    boolean replace(QualityRecord previous, QualityRecord next);

    List<QualityRecord> list(Query query, Instant now);

    record Query(QualityRecord.Kind kind, String environment, String site, String route, String version,
                 Instant from, Instant to, long offset, int limit, Boolean completed) {
        public Query(QualityRecord.Kind kind, String environment, String site, String route, String version,
                     Instant from, Instant to, long offset, int limit) {
            this(kind, environment, site, route, version, from, to, offset, limit, null);
        }

        public Query {
            if (kind == null || environment == null || environment.isBlank() || offset < 0
                || limit < 1 || limit > 10001 || (from != null && to != null && !from.isBefore(to))) {
                throw new IllegalArgumentException("Invalid quality query");
            }
        }
    }
}
