package com.careerform.evaluation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
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
import com.careerform.evaluation.run.CallTarget;
import com.careerform.evaluation.run.EvaluationProviders;
import com.careerform.formanalysis.application.port.ChoiceModel;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;
import tools.jackson.databind.JsonNode;
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
    @DisplayName("whole-form 조건은 화면 전체를 한 덩어리로 묶고 칸마다 전체 항목을 선택지로 묻는다(범주 좁히기 전 구조)")
    void wholeFormAsksEveryKeyForTheWholeScreen() throws Exception {
        JsonMapper mapper = context.getBean(JsonMapper.class);
        List<Integer> questionCounts = new ArrayList<>();
        List<Integer> criteriaCounts = new ArrayList<>();
        ChoiceModel fake = new ChoiceModel() {
            @Override public String provider() { return "fake"; }
            @Override public String model() { return "fake-1"; }
            @Override public Map<String, Judgement> answer(Object state, Map<String, Question> questions) {
                questionCounts.add(questions.size());
                questions.values().forEach(question -> criteriaCounts.add(question.criteria().size()));
                Map<String, Judgement> result = new java.util.LinkedHashMap<>();
                questions.keySet().forEach(id -> result.put(id, new Judgement(ChoiceModel.ABSTAIN, 0.5, Map.of())));
                return result;
            }
            @Override public Map<String, String> choose(Object state, Map<String, Question> questions) {
                return Map.of();
            }
        };
        ServiceProductCallGateway gateway = new ServiceProductCallGateway(mapper, context.getBean(Validator.class),
            new EvaluationProviders(List.of(new EvaluationProviders.Provider("fake", List.of("fake-1"), Map.of(), List.of(),
                model -> fake))), context.getBean(ServiceProductCallGateway.ProductParts.class));
        JsonNode file = mapper.readTree(getClass().getClassLoader().getResourceAsStream(
            "evaluation/datasets/generic-matching/v4/cases/nhn-presales-initial-synthetic-01.json"));
        JsonNode fields = null;
        for (JsonNode call : file.path("calls")) {
            if ("GENERIC_FIELDS".equals(call.path("kind").asString())) {
                fields = call.path("request");
            }
        }

        JsonNode response = gateway.call(CallKind.GENERIC_FIELDS, fields,
            new CallTarget("fake", "fake-1", Map.of("field-batch-size", "128", "section-concurrency", "3", "whole-form", "1")));

        assertThat(questionCounts).containsExactly(52);
        assertThat(criteriaCounts).allMatch(count -> count > 100);
        assertThat(response.path("fields")).hasSize(52);
    }

    @Test
    @DisplayName("저장소 데이터셋의 제품 요청을 엄격 JSON과 검증 규칙으로 읽어, 실행이 고른 공급자의 선택 모델로 제품 서비스를 부른다")
    void repositoryDatasetRequestsGoToChosenProvider() throws Exception {
        JsonMapper mapper = context.getBean(JsonMapper.class);
        List<String> asked = new ArrayList<>();
        ChoiceModel fake = new ChoiceModel() {
            @Override public String provider() { return "fake"; }
            @Override public String model() { return "fake-1"; }
            @Override public Map<String, Judgement> answer(Object state, Map<String, Question> questions) {
                asked.add("answer");
                Map<String, Judgement> result = new java.util.LinkedHashMap<>();
                questions.keySet().forEach(id -> result.put(id, new Judgement(ChoiceModel.ABSTAIN, 0.5, Map.of())));
                return result;
            }
            @Override public Map<String, String> choose(Object state, Map<String, Question> questions) {
                asked.add("choose");
                Map<String, String> result = new java.util.LinkedHashMap<>();
                questions.keySet().forEach(id -> result.put(id, ChoiceModel.ABSTAIN));
                return result;
            }
        };
        EvaluationProviders providers = new EvaluationProviders(List.of(
            new EvaluationProviders.Provider("fake", List.of("fake-1"), Map.of(), List.of(), model -> fake)));
        ServiceProductCallGateway gateway = new ServiceProductCallGateway(mapper, context.getBean(Validator.class),
            providers, context.getBean(ServiceProductCallGateway.ProductParts.class));
        List<String> statuses = new ArrayList<>();
        for (String state : List.of("initial", "high-school", "university", "ged")) {
            JsonNode file = mapper.readTree(getClass().getClassLoader().getResourceAsStream(
                "evaluation/datasets/generic-matching/v3/cases/woowahan-r2605009-" + state + "-synthetic-01.json"));
            for (JsonNode call : file.path("calls")) {
                JsonNode response = gateway.call(CallKind.valueOf(call.path("kind").asString()), call.path("request"),
                    new CallTarget("fake", "fake-1", Map.of("field-batch-size", "5", "section-concurrency", "3")));
                statuses.add(response.path("status").asString());
            }
        }
        assertThat(statuses).hasSize(11).doesNotContainNull();
        assertThat(asked).contains("answer", "choose");
        assertThatThrownBy(() -> gateway.call(CallKind.SECTION_CLASSIFY, mapper.readTree("{}"),
            new CallTarget("missing", "x", Map.of()))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("공급자 목록에는 제품 JEV 연결이 있을 때 jev가 들어가고, OpenAI는 평가 설정을 켜지 않으면 없다")
    void providersReflectConfiguration() {
        EvaluationProviders providers = context.getBean(EvaluationProviders.class);
        assertThat(providers.all()).extracting(EvaluationProviders.Provider::name).doesNotContain("openai");
    }
}
