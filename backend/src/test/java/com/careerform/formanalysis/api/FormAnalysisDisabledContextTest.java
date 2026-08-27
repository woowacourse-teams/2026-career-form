package com.careerform.formanalysis.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiClient;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false",
    "career-form.llm.provider=",
    "career-form.llm.model=",
    "spring.ai.openai.api-key="
})
@AutoConfigureMockMvc
@DisplayName("LLM 비활성화 애플리케이션 컨텍스트")
class FormAnalysisDisabledContextTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ApplicationContext context;

    @Test
    @DisplayName("provider bean 없이 두 endpoint를 PARTIAL 상태로 유지한다")
    void keepsBothEndpointsAsUnavailablePartialWithoutProviderBeans() throws Exception {
        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("preparation-request-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("GENERIC"))
            .andExpect(jsonPath("$.analysisStatus").value("PARTIAL"))
            .andExpect(jsonPath("$.warningCodes[0]").value("LLM_UNAVAILABLE"))
            .andExpect(jsonPath("$.preparationPlans").isEmpty());

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("fields-request-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("GENERIC"))
            .andExpect(jsonPath("$.analysisStatus").value("PARTIAL"))
            .andExpect(jsonPath("$.warningCodes[0]").value("LLM_UNAVAILABLE"))
            .andExpect(jsonPath("$.fields").isEmpty());

        org.assertj.core.api.Assertions.assertThat(
            context.getBeansOfType(ActionResolver.class)
        ).isEmpty();
        org.assertj.core.api.Assertions.assertThat(
            context.getBeansOfType(FieldMappingResolver.class)
        ).isEmpty();
        org.assertj.core.api.Assertions.assertThat(
            context.getBeansOfType(OpenAiClient.class)
        ).isEmpty();
    }

    @Test
    @DisplayName("폐기한 v1 endpoint를 노출하지 않는다")
    void doesNotExposeTheSupersededV1Endpoint() throws Exception {
        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"contextFields\":[],\"targetFields\":[]}"))
            .andExpect(status().isNotFound());
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}
