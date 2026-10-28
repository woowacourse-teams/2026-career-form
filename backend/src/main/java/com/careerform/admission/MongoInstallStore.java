package com.careerform.admission;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

public final class MongoInstallStore implements InstallStore {
    private final MongoTemplate mongo;
    public MongoInstallStore(MongoTemplate mongo) { this.mongo = mongo; }

    public void ensureIndexes() {
        mongo.indexOps(InstallRecord.class).createIndex(new Index().on("keyHash", Sort.Direction.ASC).unique().sparse());
        mongo.indexOps(InstallRecord.class).createIndex(new Index().on("completedAt", Sort.Direction.ASC));
    }

    public Optional<InstallRecord> find(String id) { return Optional.ofNullable(mongo.findById(id, InstallRecord.class)); }
    public Optional<InstallRecord> registration(String keyHash) {
        return Optional.ofNullable(mongo.findOne(Query.query(Criteria.where("keyHash").is(keyHash)), InstallRecord.class));
    }
    public boolean insert(InstallRecord record) {
        try { mongo.insert(record); return true; }
        catch (DuplicateKeyException duplicate) { return false; }
    }

    public void clearRecoveryCopies(Instant now) {
        mongo.updateMulti(Query.query(Criteria.where("completedAt").lte(now.minus(Duration.ofMinutes(10))).and("replay").exists(true)),
            new Update().unset("replay"), InstallRecord.class);
        mongo.updateMulti(Query.query(Criteria.where("completedAt").lte(now.minus(Duration.ofHours(24))).and("keyHash").exists(true)),
            new Update().unset("keyHash"), InstallRecord.class);
    }
}
