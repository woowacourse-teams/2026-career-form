package com.careerform.notification;

import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import org.bson.Document;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.BulkOperationException;
import org.springframework.data.mongodb.core.BulkOperations;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.FindAndReplaceOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

public final class MongoNotificationStore implements NotificationStore {
    private static final int DUPLICATE_KEY = 11000;
    private final MongoTemplate mongo;

    public MongoNotificationStore(MongoTemplate mongo) { this.mongo = mongo; }

    public void ensureIndexes() {
        mongo.indexOps(JobPosting.class).createIndex(new Index().on("link", Sort.Direction.ASC).unique());
        mongo.indexOps(JobPosting.class).createIndex(new Index().on("opensAt", Sort.Direction.ASC).on("closesAt", Sort.Direction.ASC));
        mongo.indexOps(PushSubscription.class).createIndex(new Index().on("endpoint", Sort.Direction.ASC).unique());
        mongo.indexOps(PushDelivery.class).createIndex(new Index().on("postingId", Sort.Direction.ASC).on("subscriptionId", Sort.Direction.ASC).unique());
        mongo.indexOps(PushDelivery.class).createIndex(new Index().on("status", Sort.Direction.ASC).on("nextAttemptAt", Sort.Direction.ASC));
        mongo.indexOps(PushDelivery.class).createIndex(new Index().on("status", Sort.Direction.ASC).on("leaseUntil", Sort.Direction.ASC));
        mongo.indexOps(PushDelivery.class).createIndex(new Index().on("postingId", Sort.Direction.ASC).on("status", Sort.Direction.ASC));
    }

    @Override public boolean insertPosting(JobPosting posting) { return insert(posting); }

    @Override public Optional<JobPosting> findPosting(String id) { return Optional.ofNullable(mongo.findById(id, JobPosting.class)); }

    @Override public Optional<JobPosting> findPostingByLink(String link) {
        return Optional.ofNullable(mongo.findOne(Query.query(Criteria.where("link").is(link)), JobPosting.class));
    }

    @Override public List<JobPosting> listPostings() {
        return List.copyOf(mongo.find(new Query().with(Sort.by(Sort.Direction.DESC, "registeredAt").and(Sort.by(Sort.Direction.ASC, "_id"))), JobPosting.class));
    }

    @Override public List<JobPosting> listOpenPostings(Instant now) {
        var query = Query.query(Criteria.where("opensAt").lte(now).and("closesAt").gt(now))
            .with(Sort.by(Sort.Direction.ASC, "closesAt").and(Sort.by(Sort.Direction.ASC, "_id")));
        return List.copyOf(mongo.find(query, JobPosting.class));
    }

    @Override public boolean deletePosting(String id) {
        return mongo.remove(Query.query(Criteria.where("_id").is(id)), JobPosting.class).getDeletedCount() > 0;
    }

    @Override public boolean insertSubscription(PushSubscription subscription) { return insert(subscription); }

    @Override public Optional<PushSubscription> findSubscription(String id) { return Optional.ofNullable(mongo.findById(id, PushSubscription.class)); }

    @Override public Optional<PushSubscription> findSubscriptionByEndpoint(String endpoint) {
        return Optional.ofNullable(mongo.findOne(Query.query(Criteria.where("endpoint").is(endpoint)), PushSubscription.class));
    }

    @Override public List<String> subscriptionIds() {
        return List.copyOf(mongo.findDistinct(new Query(), "_id", PushSubscription.class, String.class));
    }

    @Override public boolean deleteSubscription(String id) {
        return mongo.remove(Query.query(Criteria.where("_id").is(id)), PushSubscription.class).getDeletedCount() > 0;
    }

    @Override public boolean deleteSubscriptionByEndpoint(String endpoint) {
        return mongo.remove(Query.query(Criteria.where("endpoint").is(endpoint)), PushSubscription.class).getDeletedCount() > 0;
    }

    @Override public void insertDeliveries(List<PushDelivery> deliveries) {
        if (deliveries.isEmpty()) { return; }
        var operations = mongo.bulkOps(BulkOperations.BulkMode.UNORDERED, PushDelivery.class);
        operations.insert(deliveries);
        try {
            operations.execute();
        } catch (BulkOperationException exception) {
            if (exception.getErrors().stream().anyMatch(error -> error.getCode() != DUPLICATE_KEY)) { throw exception; }
        } catch (DuplicateKeyException ignored) {
            // 같은 공고 × 구독 쌍은 이미 예약돼 있다.
        }
    }

    @Override public Optional<PushDelivery> findDelivery(String id) { return Optional.ofNullable(mongo.findById(id, PushDelivery.class)); }

    @Override public List<PushDelivery> findDueDeliveries(Instant now, int limit) {
        var due = new Criteria().orOperator(
            Criteria.where("status").is(PushDelivery.Status.PENDING).and("nextAttemptAt").lte(now),
            Criteria.where("status").is(PushDelivery.Status.SENDING).and("leaseUntil").lte(now));
        var query = new Query(due).with(Sort.by(Sort.Direction.ASC, "nextAttemptAt").and(Sort.by(Sort.Direction.ASC, "_id"))).limit(limit);
        return List.copyOf(mongo.find(query, PushDelivery.class));
    }

    @Override public Optional<PushDelivery> claimDelivery(PushDelivery observed, Instant now, Instant leaseUntil) {
        var identity = Criteria.where("_id").is(observed.id()).and("status").is(observed.status());
        var due = switch (observed.status()) {
            case PENDING -> identity.and("nextAttemptAt").lte(now);
            case SENDING -> identity.and("leaseUntil").lte(now);
            default -> null;
        };
        if (due == null) { return Optional.empty(); }
        var update = new Update().set("status", PushDelivery.Status.SENDING).set("leaseUntil", leaseUntil).set("lastAttemptAt", now).inc("attempts", 1);
        return Optional.ofNullable(mongo.findAndModify(Query.query(due), update, FindAndModifyOptions.options().returnNew(true), PushDelivery.class));
    }

    @Override public boolean completeDelivery(PushDelivery claimed, PushDelivery next) {
        if (!claimed.id().equals(next.id())) { throw new IllegalArgumentException("Delivery identity changed"); }
        var query = Query.query(Criteria.where("_id").is(claimed.id()).and("status").is(PushDelivery.Status.SENDING)
            .and("leaseUntil").is(claimed.leaseUntil()).and("attempts").is(claimed.attempts()));
        return mongo.findAndReplace(query, next, FindAndReplaceOptions.options().returnNew()) != null;
    }

    @Override public long deletePendingDeliveries(String postingId) {
        return mongo.remove(Query.query(Criteria.where("postingId").is(postingId).and("status").is(PushDelivery.Status.PENDING)), PushDelivery.class)
            .getDeletedCount();
    }

    @Override public DeliveryProgress deliveryProgress(String postingId) {
        var aggregation = Aggregation.newAggregation(Aggregation.match(Criteria.where("postingId").is(postingId)),
            Aggregation.group("status").count().as("count").max("lastAttemptAt").as("lastAttemptAt"));
        long pending = 0;
        long sending = 0;
        long accepted = 0;
        long abandoned = 0;
        Instant lastAttemptAt = null;
        for (var row : mongo.aggregate(aggregation, PushDelivery.class, Document.class).getMappedResults()) {
            var count = ((Number) row.get("count")).longValue();
            switch (PushDelivery.Status.valueOf(row.getString("_id"))) {
                case PENDING -> pending = count;
                case SENDING -> sending = count;
                case ACCEPTED -> accepted = count;
                case ABANDONED -> abandoned = count;
            }
            var attempt = row.get("lastAttemptAt", Date.class);
            if (attempt != null && (lastAttemptAt == null || attempt.toInstant().isAfter(lastAttemptAt))) { lastAttemptAt = attempt.toInstant(); }
        }
        return new DeliveryProgress(pending, sending, accepted, abandoned, lastAttemptAt);
    }

    private boolean insert(Object document) {
        try {
            mongo.insert(document);
            return true;
        } catch (DuplicateKeyException duplicate) {
            return false;
        }
    }
}
