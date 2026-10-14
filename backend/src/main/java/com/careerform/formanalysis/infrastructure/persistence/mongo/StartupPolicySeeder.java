package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.nio.charset.StandardCharsets;
import org.bson.Document;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Component;

/** Insert-only bootstrap. Existing policies and active versions are owned by the database. */
@Component
@Profile({"local", "dev", "staging", "prod"})
final class StartupPolicySeeder implements ApplicationRunner {
    private final MongoTemplate mongo;

    StartupPolicySeeder(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @Override
    public void run(ApplicationArguments arguments) throws Exception {
        Document seed;
        try (var source = getClass().getResourceAsStream("/policies/startup-policy-seed-v1.json")) {
            if (source == null) throw new IllegalStateException("Startup policy seed missing");
            seed = Document.parse(new String(source.readAllBytes(), StandardCharsets.UTF_8));
        }
        // All policies must be available before publishing any new active-version pointer.
        for (var policy : seed.getList("policies", Document.class)) {
            var identity = new Criteria().orOperator(
                Criteria.where("_id").is(policy.get("_id")),
                Criteria.where("companyKey").is(policy.get("companyKey")).and("version").is(policy.get("version")));
            insertIfMissing(policy, "form_analysis_policies", identity);
        }
        var provider = seed.get("provider", Document.class);
        insertIfMissing(provider, "execution_provider_policies", Criteria.where("_id").is(provider.get("_id")));
        for (var company : seed.getList("companies", Document.class)) {
            var identity = new Criteria().orOperator(
                Criteria.where("_id").is(company.get("_id")),
                Criteria.where("companyKey").is(company.get("companyKey")),
                Criteria.where("host").is(company.get("host")));
            insertIfMissing(company, "form_analysis_companies", identity);
        }
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
