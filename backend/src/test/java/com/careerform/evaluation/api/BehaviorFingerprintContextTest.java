package com.careerform.evaluation.api;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import com.careerform.evaluation.dataset.DatasetLoader;
import com.careerform.evaluation.run.BehaviorFingerprint;
import com.careerform.evaluation.run.InMemoryResultStore;
import com.careerform.evaluation.run.InMemoryRunStore;
import com.careerform.evaluation.run.InMemoryScoringStore;
import com.careerform.evaluation.run.ResultStore;
import com.careerform.evaluation.run.RunStore;
import com.careerform.evaluation.run.ScoringStore;
import com.careerform.evaluation.run.ServiceProductCallGateway;
import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test?serverSelectionTimeoutMS=200",
    "career-form.llm.enabled=false",
    "management.health.mongodb.enabled=false",
    "career-form.evaluation.enabled=true",
    "career-form.evaluation.seed-records.enabled=false",
    "career-form.evaluation.poll-interval=1h",
    "career-form.quality.enabled=true",
    "career-form.quality.password-hash=pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk="
})
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@Import(BehaviorFingerprintContextTest.Stores.class)
@DisplayName("저장소 데이터셋으로 만드는 동작 지문")
class BehaviorFingerprintContextTest {

    @TestConfiguration(proxyBeanMethods = false)
    static class Stores {
        @Bean @Primary RunStore memoryRunStore() { return new InMemoryRunStore(); }
        @Bean @Primary ResultStore memoryResultStore() { return new InMemoryResultStore(); }
        @Bean @Primary ScoringStore memoryScoringStore() { return new InMemoryScoringStore(); }
    }

    @Autowired private JsonMapper mapper;
    @Autowired private Validator validator;
    @Autowired private ServiceProductCallGateway.ProductParts parts;
    @Autowired private DatasetLoader datasets;
    @MockitoBean private FormAnalysisCompanyMongoRepository companies;

    private String digest(int version, int concurrency, int batch) {
        return new BehaviorFingerprint(mapper, validator, parts)
            .digest(datasets.load("generic-matching", version), concurrency, batch);
    }

    @Test
    @DisplayName("같은 코드·데이터셋이면 병렬 처리 순서와 무관하게 항상 같다")
    void stableAcrossRuns() {
        assertThat(digest(4, 3, 5)).hasSize(64).isEqualTo(digest(4, 3, 5));
        assertThat(digest(4, 1, 5)).isEqualTo(digest(4, 3, 5));
    }

    @Test
    @DisplayName("AI에 묻는 내용이 달라지면(칸 묶음, 데이터셋) 달라진다")
    void changesWhenQuestionsChange() {
        assertThat(digest(4, 3, 10)).isNotEqualTo(digest(4, 3, 5));
        assertThat(digest(3, 3, 5)).isNotEqualTo(digest(4, 3, 5));
    }
}
