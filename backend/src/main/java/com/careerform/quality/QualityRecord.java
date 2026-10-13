package com.careerform.quality;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("quality_records")
public record QualityRecord(
    @Id String id,
    Kind kind,
    Group group,
    long revision,
    Instant createdAt,
    @Indexed(expireAfter = "0s") Instant expiresAt,
    Object payload
) {
    public QualityRecord {
        Objects.requireNonNull(id);
        Objects.requireNonNull(kind);
        Objects.requireNonNull(group);
        Objects.requireNonNull(createdAt);
        Objects.requireNonNull(payload);
        if (id.isBlank() || revision < 0) {
            throw new IllegalArgumentException("Invalid quality record identity");
        }
        if (payload instanceof Map<?, ?> map) {
            payload = Map.copyOf(map);
        } else if (payload instanceof List<?> list) {
            payload = List.copyOf(list);
        }
    }

    public enum Kind {
        REQUEST, EXECUTION, AGGREGATE, CANDIDATE, CONFIRMATION, BATCH
    }

    public record Group(String environment, String site, String structure, String route, String version, String host, QualitySite.Status identity) {
        public Group(String environment, String site, String structure, String route, String version) {
            this(environment, site, structure, route, version, site, QualitySite.Status.UNVERIFIED);
        }

        public Group {
            Objects.requireNonNull(environment);
        }

        public Group withSite(String nextSite) { return new Group(environment, nextSite, structure, route, version, host, identity); }
    }

    public QualityRecord withPayload(Object next) {
        return new QualityRecord(id, kind, group, Math.incrementExact(revision), createdAt, expiresAt, next);
    }
}
