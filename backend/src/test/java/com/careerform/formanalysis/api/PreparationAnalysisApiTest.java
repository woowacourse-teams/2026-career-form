package com.careerform.formanalysis.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Function;

import org.junit.jupiter.api.BeforeEach;
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

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.domain.ActionResolution;
import com.careerform.formanalysis.domain.PreparationSnapshot;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false",
    "career-form.form-analysis.max-request-bytes=65536"
})
@AutoConfigureMockMvc
@Import(PreparationAnalysisApiTest.FakeResolverConfiguration.class)
class PreparationAnalysisApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FakeActionResolver resolver;

    @BeforeEach
    void resetResolver() {
        resolver.respondWith(snapshot -> new ActionResolution(
            2,
            snapshot.snapshotId(),
            snapshot.actionCandidateIdsInTraversalOrder().stream()
                .map(ActionResolution.NoAction::new)
                .map(ActionResolution.Result.class::cast)
                .toList()
        ));
    }

    @Test
    void analyzesPreparationSnapshotThroughTheAlwaysOnEndpoint() throws Exception {
        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.snapshotId").value("snapshot-preparation-1"))
            .andExpect(jsonPath("$.mode").value("GENERIC"))
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.preparationPlans").isEmpty())
            .andExpect(jsonPath("$.warningCodes").doesNotExist());
    }

    @Test
    void rejectsFieldsContractAtPreparationEndpoint() throws Exception {
        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fieldsFixture()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void rejectsUnknownPropertiesWithoutEchoingThem() throws Exception {
        String privateMarker = "private-request-marker";
        String request = fixture().replace(
            "{\n",
            "{\n  \"unexpected\": \"" + privateMarker + "\",\n"
        );

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
            .andExpect(content().string(not(containsString(privateMarker))));
    }

    @Test
    void rejectsDuplicateCandidateRelationship() throws Exception {
        String request = fixture().replace("action-item", "action-direct");

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void rejectsExplicitNullEmptyAndFalseOptionalValues() throws Exception {
        String explicitNull = fixture().replace(
            "\"displayName\": \"학력 추가\"",
            "\"displayName\": null"
        );
        String empty = fixture().replace(
            "\"displayName\": \"학력 추가\"",
            "\"displayName\": \"\""
        );
        String falseFlag = fixture().replace(
            "\"displayName\": \"학력 추가\"",
            "\"displayName\": \"학력 추가\", \"disabled\": false"
        );

        for (String request : List.of(explicitNull, empty, falseFlag)) {
            mockMvc.perform(post("/api/v1/preparation/analyze")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(request))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
    }

    @Test
    void rejectsStringsBeyondTheirAbsoluteLimits() throws Exception {
        String request = fixture().replace(
            "snapshot-preparation-1",
            "x".repeat(129)
        );

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void convertsUnexpectedApplicationFailureToGeneralizedInternalError() throws Exception {
        String privateMarker = "synthetic-private-local-bug";
        resolver.respondWith(snapshot -> {
            throw new IllegalStateException(privateMarker);
        });

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture()))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
            .andExpect(content().string(not(containsString(privateMarker))));
    }

    private static String fixture() throws Exception {
        return new ClassPathResource("formanalysis/preparation-request-v2.json")
            .getContentAsString(StandardCharsets.UTF_8);
    }

    private static String fieldsFixture() throws Exception {
        return new ClassPathResource("formanalysis/fields-request-v2.json")
            .getContentAsString(StandardCharsets.UTF_8);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeResolverConfiguration {

        @Bean
        @Primary
        FakeActionResolver fakeActionResolver() {
            return new FakeActionResolver();
        }
    }

    static final class FakeActionResolver implements ActionResolver {

        private Function<PreparationSnapshot, ActionResolution> behavior;

        void respondWith(Function<PreparationSnapshot, ActionResolution> behavior) {
            this.behavior = behavior;
        }

        @Override
        public ActionResolution resolve(PreparationSnapshot snapshot) {
            return behavior.apply(snapshot);
        }
    }
}
