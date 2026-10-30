package com.careerform.evaluation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import jakarta.validation.Validator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.careerform.evaluation.run.InMemoryResultStore;
import com.careerform.evaluation.run.InMemoryRunStore;
import com.careerform.evaluation.run.InMemoryScoringStore;
import com.careerform.evaluation.run.ResultStore;
import com.careerform.evaluation.run.RunService;
import com.careerform.evaluation.run.RunStore;
import com.careerform.evaluation.run.ScoringStore;
import com.careerform.evaluation.run.ServiceProductCallGateway;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.InteractionDecisionService;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver;
import com.careerform.formanalysis.generic.SectionClassificationService;
import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test?serverSelectionTimeoutMS=200",
    "career-form.llm.enabled=false",
    "management.health.mongodb.enabled=false",
    "career-form.evaluation.enabled=true",
    "career-form.evaluation.poll-interval=1h",
    "career-form.quality.enabled=true",
    "career-form.quality.password-hash=pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk="
})
@AutoConfigureMockMvc
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@Import(EvaluationEnabledContextTest.Stores.class)
@DisplayName("평가 기능 토글이 켜진 애플리케이션 컨텍스트")
class EvaluationEnabledContextTest {

    private static final String PASSWORD = "Basic " + Base64.getEncoder()
        .encodeToString("quality:synthetic-only".getBytes(StandardCharsets.UTF_8));

    @TestConfiguration(proxyBeanMethods = false)
    static class Stores {
        @Bean @Primary RunStore memoryRunStore() { return new InMemoryRunStore(); }
        @Bean @Primary ResultStore memoryResultStore() { return new InMemoryResultStore(); }
        @Bean @Primary ScoringStore memoryScoringStore() { return new InMemoryScoringStore(); }
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ApplicationContext context;
    @MockitoBean private FormAnalysisCompanyMongoRepository companies;

    @Test
    @DisplayName("평가 API가 품질 비밀번호 뒤에 열리고 실행 서비스가 조립된다")
    void exposesProtectedApi() throws Exception {
        mockMvc.perform(get("/api/v1/evaluations/runs")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/evaluations/runs").header("Authorization", PASSWORD)).andExpect(status().isOk());
        assertThat(context.getBeansOfType(RunService.class)).hasSize(1);
    }

    @Test
    @DisplayName("저장소 데이터셋의 모든 제품 요청을 백엔드 엄격 JSON과 검증 규칙으로 읽고 제품 서비스에 넣을 수 있다")
    void repositoryDatasetRequestsAreAcceptedByProductServices() throws Exception {
        JsonMapper mapper = context.getBean(JsonMapper.class);
        ServiceProductCallGateway gateway = new ServiceProductCallGateway(mapper, context.getBean(Validator.class),
            context.getBean(SectionClassificationService.class), context.getBean(InteractionDecisionService.class),
            Optional.ofNullable(context.getBeanProvider(JevCategoryFieldResolver.class).getIfAvailable()),
            context.getBean(FormAnalysisRouter.class), context.getBean(FieldInteractionPolicy.class),
            context.getBean(SupportedProfileFields.class));
        List<String> statuses = new ArrayList<>();
        for (String state : List.of("initial", "high-school", "university")) {
            JsonNode file = mapper.readTree(getClass().getClassLoader().getResourceAsStream(
                "evaluation/datasets/generic-matching/v1/cases/woowahan-r2605009-" + state + "-synthetic-01.json"));
            for (JsonNode call : file.path("calls")) {
                JsonNode response = gateway.call(CallKind.valueOf(call.path("kind").asString()), call.path("request"),
                    Map.of("field-batch-size", "5", "section-concurrency", "3"));
                statuses.add(response.path("status").asString());
            }
        }
        assertThat(statuses).hasSize(10).doesNotContainNull();
    }
}
