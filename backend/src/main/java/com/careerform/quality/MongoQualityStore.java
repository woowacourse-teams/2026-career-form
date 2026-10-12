package com.careerform.quality;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.FindAndReplaceOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.query.Criteria;

public final class MongoQualityStore implements QualityStore {
    private final MongoTemplate mongo;

    public MongoQualityStore(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    public void ensureIndexes() {
        mongo.indexOps(QualityRecord.class).createIndex(new Index().on("expiresAt", Sort.Direction.ASC).expire(Duration.ZERO));
        mongo.indexOps(QualityRecord.class).createIndex(new Index().on("kind", Sort.Direction.ASC)
            .on("group.environment", Sort.Direction.ASC).on("createdAt", Sort.Direction.ASC).on("_id", Sort.Direction.ASC));
    }

    @Override
    public boolean insert(QualityRecord record) {
        try {
            mongo.insert(record);
            return true;
        } catch (DuplicateKeyException duplicate) {
            return false;
        }
    }

    @Override
    public Optional<QualityRecord> find(String id, Instant now) {
        return Optional.ofNullable(mongo.findOne(new org.springframework.data.mongodb.core.query.Query(
            new Criteria().andOperator(Criteria.where("_id").is(id), alive(now))), QualityRecord.class));
    }

    @Override
    public boolean replace(QualityRecord previous, QualityRecord next) {
        if (!previous.id().equals(next.id()) || previous.kind() != next.kind()
            || next.revision() != Math.incrementExact(previous.revision()) || !previous.createdAt().equals(next.createdAt())) {
            throw new IllegalArgumentException("Invalid quality revision");
        }
        var query = new org.springframework.data.mongodb.core.query.Query(Criteria.where("_id").is(previous.id())
            .and("revision").is(previous.revision()).and("kind").is(previous.kind()));
        return mongo.findAndReplace(query, next, FindAndReplaceOptions.options().returnNew()) != null;
    }

    @Override
    public List<QualityRecord> list(Query requested, Instant now) {
        var criteria = Criteria.where("kind").is(requested.kind()).and("group.environment").is(requested.environment());
        if (requested.site() != null) {
            criteria.andOperator(new Criteria().orOperator(Criteria.where("group.site").is(requested.site()), Criteria.where("group.host").is(requested.site())));
        }
        if (requested.route() != null) {
            criteria.and("group.route").is(requested.route());
        }
        if (requested.version() != null) {
            criteria.and("group.version").is(requested.version());
        }
        if (requested.completed() != null) {
            if (requested.completed()) { criteria.and("payload.status").is("COMPLETED"); }
            else { criteria.and("payload.status").ne("COMPLETED"); }
        }
        if (requested.from() != null || requested.to() != null) {
            var date = criteria.and("createdAt");
            if (requested.from() != null) {
                date.gte(requested.from());
            }
            if (requested.to() != null) {
                date.lt(requested.to());
            }
        }
        var query = new org.springframework.data.mongodb.core.query.Query(new Criteria().andOperator(criteria, alive(now)))
            .with(Sort.by("createdAt", "id")).skip(requested.offset()).limit(requested.limit());
        return List.copyOf(mongo.find(query, QualityRecord.class));
    }

    private Criteria alive(Instant now) {
        return new Criteria().orOperator(Criteria.where("expiresAt").is(null), Criteria.where("expiresAt").gt(now));
    }
}
