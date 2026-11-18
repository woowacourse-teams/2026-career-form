package com.careerform.evaluation.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;

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
import com.careerform.formanalysis.generic.ChoiceFieldResolver;
import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;
import io.micrometer.core.instrument.MeterRegistry;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test?serverSelectionTimeoutMS=200",
    "management.health.mongodb.enabled=false",
    "career-form.analysis.enabled=true",
    "career-form.analysis.provider=jev",
    "career-form.analysis.jev.api-key=synthetic-test-key",
    "career-form.analysis.jev.data-policy-reviewed=true",
    "career-form.evaluation.enabled=true",
    "career-form.evaluation.seed-records.enabled=false",
    "career-form.evaluation.poll-interval=1h",
    "career-form.quality.enabled=true",
    "career-form.quality.password-hash=pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk="
})
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@Import(SectionAnswerCacheFingerprintTest.Stores.class)
@DisplayName("섹션 결과 캐시가 켜진 운영 분석기와 평가의 동작 지문")
class SectionAnswerCacheFingerprintTest {

    private static final String METRIC = "career.form.analysis.section.cache";

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
    @Autowired private Optional<ChoiceFieldResolver> product;
    @Autowired private MeterRegistry registry;
    @MockitoBean private FormAnalysisCompanyMongoRepository companies;

    @Test
    @DisplayName("평가가 쓰는 운영 분석기 사본은 캐시를 읽지도 쓰지도 않아 지문이 캐시 없는 조립과 같다")
    void evaluationCopiesKeepBehaviorFingerprint() {
        var dataset = datasets.load("generic-matching", 5);
        var withoutCache = new ServiceProductCallGateway.ProductParts(parts.router(), parts.categories(),
            parts.projector(), parts.interactionPolicy(), parts.fields(),
            (model, concurrency, batch) -> new ChoiceFieldResolver(model, parts.fields(), parts.categories(),
                concurrency, batch, 10, 8000));

        String fromProductCopies = new BehaviorFingerprint(mapper, validator, parts).digest(dataset, 3, 5);
        String repeated = new BehaviorFingerprint(mapper, validator, parts).digest(dataset, 3, 5);
        String expected = new BehaviorFingerprint(mapper, validator, withoutCache).digest(dataset, 3, 5);

        assertThat(product).isPresent();
        assertThat(fromProductCopies).hasSize(64).isEqualTo(expected).isEqualTo(repeated);
        assertThat(registry.get(METRIC).tag("outcome", "hit").counter().count()).isZero();
        assertThat(registry.get(METRIC).tag("outcome", "miss").counter().count()).isZero();
    }
}
