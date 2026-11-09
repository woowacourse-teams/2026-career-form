package com.careerform.admission;

import java.time.Duration;
import java.time.Instant;
import java.util.function.UnaryOperator;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.FindAndReplaceOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

public final class MongoUsageStore {
    private final MongoTemplate mongo;
    public MongoUsageStore(MongoTemplate mongo) { this.mongo = mongo; }

    public void ensureIndexes() {
        mongo.indexOps(UsageBucket.class).createIndex(new Index().on("expiresAt", Sort.Direction.ASC).expire(Duration.ZERO));
        mongo.indexOps(UsageBucket.class).createIndex(new Index().on("recoverAt", Sort.Direction.ASC));
    }

    public UsageBucket change(String id, int limit, Instant expiresAt, UnaryOperator<UsageBucket> mutation) {
        var deadline = System.nanoTime() + 2_000_000_000L;
        for (int attempt = 0; attempt < 64; attempt++) {
            if (System.nanoTime() - deadline >= 0) throw AdmissionFailure.unavailable();
            try {
                var observed = mongo.findById(id, UsageBucket.class);
                if (observed == null) {
                    try { mongo.insert(UsageBucket.empty(id, limit, expiresAt)); }
                    catch (DuplicateKeyException duplicate) { continue; }
                    observed = mongo.findById(id, UsageBucket.class);
                    if (observed == null) throw AdmissionFailure.unavailable();
                }
                var next = mutation.apply(observed);
                if (next.equals(observed)) return observed;
                var query = Query.query(Criteria.where("_id").is(id).and("revision").is(observed.revision()));
                if (mongo.findAndReplace(query, next, FindAndReplaceOptions.options().returnNew()) != null) return next;
            } catch (AdmissionFailure error) { throw error; }
            catch (RuntimeException error) {
                if (attempt == 63) throw AdmissionFailure.unavailable();
            }
        }
        throw AdmissionFailure.unavailable();
    }

    public void returnExpired(Instant now) {
        var query = Query.query(Criteria.where("recoverAt").lte(now)).limit(200);
        for (var bucket : mongo.find(query, UsageBucket.class)) {
            change(bucket.id(), bucket.limit(), bucket.expiresAt(), current -> current.expire(now));
        }
    }
}
