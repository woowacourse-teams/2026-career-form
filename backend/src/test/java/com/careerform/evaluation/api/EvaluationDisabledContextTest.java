package com.careerform.evaluation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.careerform.evaluation.run.EvaluationWorker;
import com.careerform.evaluation.run.RunService;
import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test?serverSelectionTimeoutMS=200",
    "career-form.llm.enabled=false",
    "management.health.mongodb.enabled=false",
    "career-form.evaluation.enabled=false",
    "career-form.quality.enabled=true",
    "career-form.quality.password-hash=pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk="
})
@AutoConfigureMockMvc
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@DisplayName("평가 기능 토글이 꺼진 애플리케이션 컨텍스트")
class EvaluationDisabledContextTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ApplicationContext context;
    @MockitoBean private FormAnalysisCompanyMongoRepository companies;

    @Test
    @DisplayName("비밀번호가 맞아도 평가 API가 없고 실행·작업자 bean도 없다")
    void exposesNothing() throws Exception {
        String password = "Basic " + Base64.getEncoder()
            .encodeToString("quality:synthetic-only".getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(get("/api/v1/evaluations/runs").header("Authorization", password))
            .andExpect(status().isNotFound());
        assertThat(context.getBeansOfType(RunService.class)).isEmpty();
        assertThat(context.getBeansOfType(EvaluationWorker.class)).isEmpty();
        assertThat(context.getBeansOfType(EvaluationRunController.class)).isEmpty();
    }
}
