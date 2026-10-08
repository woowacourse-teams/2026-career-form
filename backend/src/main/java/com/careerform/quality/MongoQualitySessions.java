package com.careerform.quality;

import java.time.Duration;
import java.util.Optional;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

public final class MongoQualitySessions implements QualityAccess.SessionStore {
    private final MongoTemplate mongo;

    public MongoQualitySessions(MongoTemplate mongo) { this.mongo = mongo; }

    public void ensureIndexes() {
        mongo.indexOps(QualityAccess.Session.class).createIndex(new Index().on("expiresAt", Sort.Direction.ASC).expire(Duration.ZERO));
    }

    @Override public Optional<QualityAccess.Session> find(String id) { return Optional.ofNullable(mongo.findById(id, QualityAccess.Session.class)); }
    @Override public void save(QualityAccess.Session session) { mongo.save(session); }
    @Override public void delete(String id) { mongo.remove(new Query(Criteria.where("_id").is(id)), QualityAccess.Session.class); }
}
