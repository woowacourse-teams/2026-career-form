package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.mongodb.core.MongoTemplate;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;

@EnabledIfEnvironmentVariable(named = "QUALITY_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+")
@DisplayName("격리 MongoDB의 품질 기록 저장")
class QualityPersistenceTest {

    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static MongoClient client;
    private static MongoQualityStore store;

    @BeforeAll
    static void connect() {
        client = MongoClients.create(System.getenv("QUALITY_TEST_MONGO_URI"));
        var template = new MongoTemplate(client, "cf164_test_" + UUID.randomUUID().toString().replace("-", ""));
        store = new MongoQualityStore(template);
        store.ensureIndexes();
    }

    @AfterAll
    static void disconnect() {
        client.close();
    }

    @Test
    @DisplayName("같은 식별자는 한 번만 삽입되고 중첩 지표의 타입을 유지한다")
    void insertsOnlyOnceAndPreservesTypedPayload() {
        var record = record("insert", "dev", NOW.plusSeconds(3600));

        assertThat(store.insert(record)).isTrue();
        assertThat(store.insert(record)).isFalse();
        var fetched = store.find("insert", NOW).orElseThrow();
        assertThat(fetched.payload()).isEqualTo(new QualityMetrics.Counts(5, 4, 0, 0, 0, 0));
        assertThat(fetched.group()).isEqualTo(record.group());
    }

    @Test
    @DisplayName("같은 이전 revision을 사용한 갱신은 하나만 성공한다")
    void replacesOnlyExpectedRevision() {
        var original = record("revision", "dev", NOW.plusSeconds(3600));
        store.insert(original);
        var next = original.withPayload(new QualityMetrics.Counts(5, 4, 3, 2, 1, 0));

        assertThat(store.replace(original, next)).isTrue();
        assertThat(store.replace(original, original.withPayload(new QualityMetrics.Counts(5, 5, 0, 0, 0, 0)))).isFalse();
        assertThat(store.find("revision", NOW).orElseThrow().payload())
            .isEqualTo(new QualityMetrics.Counts(5, 4, 3, 2, 1, 0));
    }

    @Test
    @DisplayName("환경과 유효기간 및 페이지 제한이 조회에 반영된다")
    void filtersScopeAndExpiryBeforePagination() {
        store.insert(record("filter-dev", "fixture-dev", NOW.plusSeconds(3600)));
        store.insert(record("filter-prod", "fixture-prod", NOW.plusSeconds(3600)));
        store.insert(record("filter-expired", "fixture-dev", NOW.minusSeconds(1)));

        var query = new QualityStore.Query(QualityRecord.Kind.REQUEST, "fixture-dev", null,
            null, null, null, null, 0, 1);
        assertThat(store.find("filter-expired", NOW)).isEmpty();
        assertThat(store.list(query, NOW)).extracting(QualityRecord::id).containsExactly("filter-dev");
    }

    private QualityRecord record(String id, String env, Instant expires) {
        return new QualityRecord(id, QualityRecord.Kind.REQUEST,
            new QualityRecord.Group(env, "site", "structure", "GENERIC", "version"),
            0, NOW, expires, new QualityMetrics.Counts(5, 4, 0, 0, 0, 0));
    }
}
