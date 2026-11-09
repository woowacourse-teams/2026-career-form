package com.careerform.evaluation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.careerform.evaluation.run.EvaluationWorker;
import com.careerform.evaluation.run.RunService;
import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test?serverSelectionTimeoutMS=200",
    "career-form.llm.enabled=false",
    "management.health.mongodb.enabled=false",
    "career-form.evaluation.enabled=true",
    "career-form.quality.enabled=false"
})
@AutoConfigureMockMvc
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@DisplayName("평가는 켰지만 품질 비밀번호 보호가 꺼진 애플리케이션 컨텍스트")
class EvaluationWithoutQualityContextTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ApplicationContext context;
    @MockitoBean private FormAnalysisCompanyMongoRepository companies;

    @Test
    @DisplayName("비밀번호 보호 없이는 평가 API, 화면, 실행·작업자를 열지 않는다")
    void exposesNothingWithoutQualityProtection() throws Exception {
        mockMvc.perform(get("/api/v1/evaluations/runs")).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/v1/evaluations/runs").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isNotFound());
        assertThat(context.getBeansOfType(RunService.class)).isEmpty();
        assertThat(context.getBeansOfType(EvaluationWorker.class)).isEmpty();
        assertThat(context.getBeansOfType(EvaluationRunController.class)).isEmpty();
        assertThat(context.getBeansOfType(EvaluationPageController.class)).isEmpty();
    }
}
