package com.careerform.formanalysis.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false",
    "career-form.llm.provider=",
    "career-form.llm.model=",
    "spring.ai.openai.api-key="
})
@AutoConfigureMockMvc
@Import(SkFormAnalysisApiTest.GenericResolverConfiguration.class)
@DisplayName("SK 지원서 어댑터 API")
class SkFormAnalysisApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("정상 Snapshot A/B는 generic Resolver 없이 ADAPTER COMPLETE로 처리한다")
    void analyzesVerifiedSnapshotsExclusivelyWithTheAdapter() throws Exception {
        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("sk-preparation-snapshot-a-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("ADAPTER"))
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.preparationPlans.length()").value(2))
            .andExpect(jsonPath("$.preparationPlans[0].command")
                .value("REVEAL_SECTION"))
            .andExpect(jsonPath("$.preparationPlans[0].expectedEffect")
                .value("TARGET_VISIBLE"))
            .andExpect(jsonPath("$.preparationPlans[0].targetSectionId")
                .value("section-detail"))
            .andExpect(jsonPath("$.preparationPlans[1].command")
                .value("ADD_REPEATABLE_GROUP"))
            .andExpect(jsonPath("$.preparationPlans[1].expectedEffect")
                .value("GROUP_COUNT_INCREMENT"))
            .andExpect(content().string(not(containsString("executionCount"))));

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("sk-fields-snapshot-b-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("ADAPTER"))
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.fields.length()").value(7))
            .andExpect(jsonPath("$.fields[0].profileFieldKey")
                .value("personal.personal.koreanFamilyName"))
            .andExpect(jsonPath("$.fields[0].autofillPolicy").value("ALLOWED"))
            .andExpect(jsonPath("$.fields[0].mappingStatus")
                .value("ADAPTER_VERIFIED"))
            .andExpect(jsonPath("$.fields[0].writePlan.command")
                .value("SET_TEXT"))
            .andExpect(jsonPath("$.fields[4].matchType").value("NO_MATCH"))
            .andExpect(jsonPath("$.fields[4].mappingStatus")
                .value("ADAPTER_VERIFIED"))
            .andExpect(jsonPath("$.fields[4].interactionStatus")
                .value("BLOCKED"))
            .andExpect(jsonPath("$.fields[4].reasonCodes[0]").value("NO_MATCH"))
            .andExpect(jsonPath("$.fields[5].profileFieldKey")
                .value("education.university.schoolName"))
            .andExpect(jsonPath("$.fields[5].autofillPolicy")
                .value("CONDITIONAL"))
            .andExpect(jsonPath("$.fields[6].profileFieldKey")
                .value("education.university.completionStatus"))
            .andExpect(jsonPath("$.fields[6].writePlan.command")
                .value("SELECT_OPTION"))
            .andExpect(content().string(not(containsString("selector"))));
    }

    @Test
    @DisplayName("SK 후보의 두 fingerprint mismatch는 generic Resolver 없이 차단한다")
    void blocksBothMismatchedSnapshotsWithoutGenericFallback() throws Exception {
        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("sk-preparation-structure-mismatch-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("ADAPTER"))
            .andExpect(jsonPath("$.analysisStatus").value("BLOCKED"))
            .andExpect(jsonPath("$.blockCode")
                .value("ADAPTER_STRUCTURE_MISMATCH"))
            .andExpect(jsonPath("$.preparationPlans").isEmpty());

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("sk-fields-structure-mismatch-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("ADAPTER"))
            .andExpect(jsonPath("$.analysisStatus").value("BLOCKED"))
            .andExpect(jsonPath("$.blockCode")
                .value("ADAPTER_STRUCTURE_MISMATCH"))
            .andExpect(jsonPath("$.fields").isEmpty());
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class GenericResolverConfiguration {

        @Bean
        ActionResolver syntheticGenericActionResolver() {
            return request -> {
                throw new AssertionError("SK route에서 generic action 호출 금지");
            };
        }

        @Bean
        FieldMappingResolver syntheticGenericFieldMappingResolver() {
            return request -> {
                throw new AssertionError("SK route에서 generic field 호출 금지");
            };
        }
    }
}
