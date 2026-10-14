package com.careerform.formanalysis.infrastructure.persistence.mongo;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.bson.Document;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

/** Initial local data only. Restarting must never replace an edited provider policy. */
@Component
@Profile("local")
final class LocalAddressProviderPolicySeeder implements ApplicationRunner {
    private static final String COLLECTION = "execution_provider_policies";
    private static final String ID = "address-provider-v1";
    private final MongoTemplate mongo;

    LocalAddressProviderPolicySeeder(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @Override
    public void run(ApplicationArguments arguments) throws Exception {
        if (mongo.findById(ID, Document.class, COLLECTION) != null) return;
        try (var source = getClass().getResourceAsStream("/policies/address-provider-v1.json")) {
            if (source == null) throw new IllegalStateException("Initial address provider policy is missing");
            var policy = new ObjectMapper().readValue(source, new TypeReference<Map<String, Object>>() {});
            try {
                mongo.insert(new Document("_id", ID).append("version", 1).append("policy", policy), COLLECTION);
            } catch (DuplicateKeyException ignored) {
                // Another initializer won. Keep that document unchanged.
            }
        }
    }
}
