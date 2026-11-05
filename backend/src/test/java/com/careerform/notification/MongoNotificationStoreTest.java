package com.careerform.notification;

import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.mongodb.core.MongoTemplate;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;

@EnabledIfEnvironmentVariable(named = "NOTIFICATION_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+.*")
@DisplayName("격리 MongoDB의 알림 저장소 저장 계약")
class MongoNotificationStoreTest extends NotificationStoreContract {
    private static MongoClient client;
    private MongoTemplate template;

    @BeforeAll
    static void connect() { client = MongoClients.create(System.getenv("NOTIFICATION_TEST_MONGO_URI")); }

    @AfterAll
    static void disconnect() { client.close(); }

    @AfterEach
    void dropDatabase() { if (template != null) { template.getDb().drop(); } }

    @Override
    protected NotificationStore store() {
        template = new MongoTemplate(client, "cf348_test_" + UUID.randomUUID().toString().replace("-", ""));
        var store = new MongoNotificationStore(template);
        store.ensureIndexes();
        store.ensureIndexes();
        return store;
    }
}
