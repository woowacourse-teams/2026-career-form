package com.careerform.formanalysis.infrastructure.persistence.mongo;

import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Component;

/**
 * Bootstraps policies from the seed bundled with the deployed commit. Policies and the provider are
 * insert-only. Each company's active version follows the seed in every profile, so a deployment (or a
 * rollback) leaves the database pointing at that commit's policy version.
 */
@Component
@Profile({"local", "dev", "staging", "prod"})
final class StartupPolicySeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(StartupPolicySeeder.class);
    static final String POLICIES = "form_analysis_policies";
    static final String COMPANIES = "form_analysis_companies";
    static final String ACTIVE_VERSION = "activePolicyVersion";

    private final MongoTemplate mongo;
    private final StartupPolicySeed seed;

    StartupPolicySeeder(MongoTemplate mongo) {
        this(mongo, new StartupPolicySeed());
    }

    @Autowired
    StartupPolicySeeder(MongoTemplate mongo, StartupPolicySeed seed) {
        this.mongo = mongo;
        this.seed = seed;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        var document = seed.document();
        // All policies must be available before publishing any new active-version pointer.
        for (var policy : document.getList("policies", Document.class))
            insertIfMissing(policy, POLICIES, policyIdentity(policy));
        var provider = document.get("provider", Document.class);
        insertIfMissing(provider, "execution_provider_policies", Criteria.where("_id").is(provider.get("_id")));
        for (var company : document.getList("companies", Document.class)) syncCompany(company);
    }

    private void syncCompany(Document company) {
        var identity = new Criteria().orOperator(
            Criteria.where("_id").is(company.get("_id")),
            Criteria.where("companyKey").is(company.get("companyKey")),
            Criteria.where("host").is(company.get("host")));
        var query = Query.query(identity);
        var existing = mongo.findOne(query, Document.class, COMPANIES);
        if (existing == null) {
            insertIfMissing(company, COMPANIES, identity);
            return;
        }
        var key = company.getString("companyKey");
        var target = company.get(ACTIVE_VERSION, Number.class).longValue();
        var current = existing.get(ACTIVE_VERSION, Number.class);
        if (current != null && current.longValue() == target) return;
        var policy = new Document("companyKey", key).append("version", target);
        if (!mongo.exists(Query.query(policyIdentity(policy)), POLICIES)) {
            log.warn("POLICY_ACTIVE_VERSION company={} from={} to={} result=missing-policy", key, current, target);
            return;
        }
        mongo.updateFirst(query, Update.update(ACTIVE_VERSION, target), COMPANIES);
        log.info("POLICY_ACTIVE_VERSION company={} from={} to={} result=updated", key, current, target);
    }

    private static Criteria policyIdentity(Document policy) {
        var byVersion = Criteria.where("companyKey").is(policy.get("companyKey")).and("version").is(policy.get("version"));
        var id = policy.get("_id");
        return id == null ? byVersion : new Criteria().orOperator(Criteria.where("_id").is(id), byVersion);
    }

    private void insertIfMissing(Document document, String collection, Criteria identity) {
        var query = Query.query(identity);
        if (mongo.exists(query, collection)) return;
        try {
            mongo.insert(document, collection);
        } catch (DuplicateKeyException concurrentInsert) {
            // A second instance may have inserted the same identity during startup.
            if (!mongo.exists(query, collection)) throw concurrentInsert;
        }
    }
}
