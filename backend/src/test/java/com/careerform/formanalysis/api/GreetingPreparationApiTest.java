package com.careerform.formanalysis.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;
import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.exception.FormAnalysisExceptionHandler;

@DisplayName("Greeting 준비 API의 클라이언트 기능 계약")
class GreetingPreparationApiTest {

    @Test
    void supportsExistingContractWithoutGreetingCapabilities() throws Exception {
        mvc(true).perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON).content(fixture()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("ADAPTER"))
            .andExpect(jsonPath("$.routingContext").doesNotExist())
            .andExpect(jsonPath("$.executionAdapterId").doesNotExist());
    }

    @ParameterizedTest
    @ValueSource(strings = {"kakaomobility.career.greetinghr.com", "career.hyundai-autoever.com",
        "www.musinsacareers.com", "new-customer.example.org", "daangnservice.career.greetinghr.com", "mediquitous.career.greetinghr.com", "recruit.kakaogames.com"})
    void mapsFieldsWithoutPreparationSession(String host) throws Exception {
        String request = new ClassPathResource("formanalysis/greeting-fields-current-v2.json")
            .getContentAsString(StandardCharsets.UTF_8).replace("career.hyundai-autoever.com", host);
        mvc(true).perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON).content(request))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("ADAPTER"))
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.executionAdapterId").doesNotExist());
    }

    @Test
    void lockedAccountFieldsDoNotBlockEditableFieldsOrReceiveWriteCommands() throws Exception {
        String request = """
            {
              "schemaVersion": 2,
              "snapshotId": "greeting-locked-account",
              "site": {
                "host": "career.hyundai-autoever.com",
                "pathPattern": "/ko/o/*/apply"
              },
              "sections": [{
                "sectionId": "section-root",
                "fields": [
                  {
                    "candidateId": "name",
                    "element": "input",
                    "control": "text",
                    "visibility": "visible",
                    "domName": "basicInformation.name",
                    "disabled": true
                  },
                  {
                    "candidateId": "phone",
                    "element": "input",
                    "control": "text",
                    "visibility": "visible",
                    "domName": "basicInformation.phoneNumber.nationalNumber",
                    "disabled": true
                  },
                  {
                    "candidateId": "email",
                    "element": "input",
                    "control": "text",
                    "visibility": "visible",
                    "domName": "basicInformation.email"
                  }
                ]
              }]
            }
            """;

        mvc(true).perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON).content(request))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("ADAPTER"))
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.blockCode").doesNotExist())
            .andExpect(jsonPath("$.fields[0].candidateId").value("name"))
            .andExpect(jsonPath("$.fields[0].mappingStatus").value("ADAPTER_VERIFIED"))
            .andExpect(jsonPath("$.fields[0].interactionStatus").value("BLOCKED"))
            .andExpect(jsonPath("$.fields[0].writePlan").doesNotExist())
            .andExpect(jsonPath("$.fields[1].candidateId").value("phone"))
            .andExpect(jsonPath("$.fields[1].interactionStatus").value("BLOCKED"))
            .andExpect(jsonPath("$.fields[1].writePlan").doesNotExist())
            .andExpect(jsonPath("$.fields[2].candidateId").value("email"))
            .andExpect(jsonPath("$.fields[2].valueBinding.profileFieldKey")
                .value("contact.contact.email"))
            .andExpect(jsonPath("$.fields[2].interactionStatus").value("READY"))
            .andExpect(jsonPath("$.fields[2].writePlan.command").value("SET_TEXT"));
    }

    @Test
    void missingPolicyIsBlockedWithoutNewContract() throws Exception {
        mvc(false).perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON).content(fixture()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.blockCode").value("ADAPTER_POLICY_UNAVAILABLE"))
            .andExpect(jsonPath("$.routingContext").doesNotExist());
    }

    private static MockMvc mvc(boolean policyAvailable) {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new CompanyFormPolicyProvider.NotRegistered(),
            (host, path) -> Decision.POSITIVE,
            () -> policyAvailable
                ? new CompanyFormPolicyProvider.Available(CompanyFormPolicyFixture.greeting())
                : new CompanyFormPolicyProvider.Unavailable()
        );
        return MockMvcBuilders.standaloneSetup(new PreparationAnalysisController(
                new PreparationAnalysisService(Optional.empty(), router)),
                new FieldsAnalysisController(new FieldsAnalysisService(Optional.empty(), router,
                    new FieldInteractionPolicy(), new SupportedProfileFields())))
            .setControllerAdvice(new FormAnalysisExceptionHandler()).build();
    }

    private static String fixture() throws Exception {
        return new ClassPathResource("formanalysis/greeting-preparation-current-v2.json")
            .getContentAsString(StandardCharsets.UTF_8);
    }
}
