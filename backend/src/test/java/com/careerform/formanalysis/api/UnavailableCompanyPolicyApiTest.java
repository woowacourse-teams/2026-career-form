package com.careerform.formanalysis.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false"
})
@AutoConfigureMockMvc
@Import(UnavailableCompanyPolicyApiTest.PolicyConfiguration.class)
@DisplayName("회사 정책 조회 실패 API")
class UnavailableCompanyPolicyApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("준비와 필드 분석을 ADAPTER_POLICY_UNAVAILABLE로 차단한다")
    void blocksBothAnalysisRoutes() throws Exception {
        assertBlocked("/api/v1/preparation/analyze", "sk-preparation-snapshot-a-v2.json");
        assertBlocked("/api/v1/fields/analyze", "sk-fields-snapshot-b-v2.json");
    }

    private void assertBlocked(String endpoint, String fixtureName) throws Exception {
        mockMvc.perform(post(endpoint)
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture(fixtureName)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("ADAPTER"))
            .andExpect(jsonPath("$.analysisStatus").value("BLOCKED"))
            .andExpect(jsonPath("$.blockCode")
                .value("ADAPTER_POLICY_UNAVAILABLE"));
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PolicyConfiguration {

        @Bean
        @Primary
        CompanyFormPolicyProvider unavailablePolicyProvider() {
            return (host, path) -> new Unavailable();
        }
    }
}
