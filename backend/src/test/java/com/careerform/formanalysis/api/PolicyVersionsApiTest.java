package com.careerform.formanalysis.api;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyDocument;
import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false",
    "management.health.mongodb.enabled=false"
})
@AutoConfigureMockMvc
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@DisplayName("정책 활성 버전 조회 API")
class PolicyVersionsApiTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private FormAnalysisCompanyMongoRepository companies;

    @Test
    @DisplayName("회사별 seed 버전과 DB 활성 버전을 함께 보여 주고 일치 여부를 표시한다")
    void listsSeedAndDatabaseVersionsPerCompany() throws Exception {
        when(companies.findByCompanyKey(anyString())).thenReturn(Optional.empty());
        when(companies.findByCompanyKey("sk")).thenReturn(Optional.of(
            new FormAnalysisCompanyDocument("sk", "sk", "www.skcareers.com", List.of("/"), 37)));
        when(companies.findByCompanyKey("hyundai")).thenReturn(Optional.of(
            new FormAnalysisCompanyDocument("hyundai", "hyundai", "talent.hyundai.com", List.of("/"), 24)));

        mockMvc.perform(get("/api/v1/policy-versions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.companies.length()").value(3))
            .andExpect(jsonPath("$.companies[0].companyKey").value("sk"))
            .andExpect(jsonPath("$.companies[0].seedActiveVersion").value(38))
            .andExpect(jsonPath("$.companies[0].activeVersion").value(37))
            .andExpect(jsonPath("$.companies[0].inSync").value(false))
            .andExpect(jsonPath("$.companies[1].companyKey").value("hyundai"))
            .andExpect(jsonPath("$.companies[1].inSync").value(true))
            .andExpect(jsonPath("$.companies[2].companyKey").value("greeting"))
            .andExpect(jsonPath("$.companies[2].activeVersion").isEmpty())
            .andExpect(jsonPath("$.companies[2].inSync").value(false));
    }
}
