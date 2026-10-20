package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.ServerSocket;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoClients;

class QualityMongoTemplateTest {
    @Test
    void boundsQualityServerSelectionWithoutChangingAnalysisMongoSettings() throws Exception {
        try (var server = new ServerSocket(0);
             var client = MongoClients.create("mongodb://127.0.0.1:" + server.getLocalPort() + "/synthetic?serverSelectionTimeoutMS=30000")) {
            var original = new MongoTemplate(client, "synthetic");
            var quality = new QualityMongoTemplate(original, 100);
            assertThat(quality.getDb().getTimeout(TimeUnit.MILLISECONDS)).isEqualTo(100L);
            assertThat(original.getDb().getTimeout(TimeUnit.MILLISECONDS)).isNull();
            var store = new MongoQualityStore(quality);
            org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(Duration.ofSeconds(3), () ->
                assertThatThrownBy(() -> store.find("synthetic", Instant.now())).isInstanceOf(org.springframework.dao.DataAccessException.class));
        }
    }
}
