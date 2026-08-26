package com.careerform.formanalysis.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.domain.FieldMappingResolution;
import com.careerform.formanalysis.domain.FieldsSnapshot;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false",
    "career-form.form-analysis.max-request-bytes=65536"
})
@AutoConfigureMockMvc
@Import(FieldsAnalysisApiTest.FakeResolverConfiguration.class)
class FieldsAnalysisApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FakeFieldMappingResolver resolver;

    @BeforeEach
    void resetResolver() {
        resolver.respondWith(snapshot -> new FieldMappingResolution(
            2,
            snapshot.snapshotId(),
            snapshot.fieldCandidateIdsInTraversalOrder().stream()
                .map(FieldMappingResolution.NoMatch::new)
                .map(FieldMappingResolution.Result.class::cast)
                .toList()
        ));
    }

    @Test
    void analyzesEveryFieldThroughTheAlwaysOnEndpoint() throws Exception {
        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.snapshotId").value("snapshot-fields-1"))
            .andExpect(jsonPath("$.mode").value("GENERIC"))
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.fields.length()").value(2))
            .andExpect(jsonPath("$.fields[0].candidateId").value("field-direct"))
            .andExpect(jsonPath("$.fields[0].matchType").value("NO_MATCH"))
            .andExpect(jsonPath("$.fields[0].reasonCodes[0]").value("NO_MATCH"));
    }

    @Test
    void rejectsPreparationContractAtFieldsEndpoint() throws Exception {
        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(preparationFixture()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void rejectsMalformedJson() throws Exception {
        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"schemaVersion\":2"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void rejectsInvalidSiteAndMetadataLengths() throws Exception {
        String hostTooLong = fixture().replace(
            "example.test",
            "x".repeat(254)
        );
        String pathTooLong = fixture().replace(
            "/application/*",
            "/" + "x".repeat(512)
        );
        String metadataTooLong = fixture().replace(
            "기본 정보",
            "x".repeat(121)
        );

        for (String request : List.of(hostTooLong, pathTooLong, metadataTooLong)) {
            mockMvc.perform(post("/api/v1/fields/analyze")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(request))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
    }

    @Test
    void rejectsEmptyItemFieldsAndExplicitNullOptions() throws Exception {
        String emptyItemFields = fixture().replace(
            "\"fields\": [\n            {\n              \"candidateId\": \"field-item\",\n              \"element\": \"select\",\n              \"control\": \"select\",\n              \"visibility\": \"visible\",\n              \"displayName\": \"국적\",\n              \"options\": [\n                {\n                  \"optionId\": \"option-1\",\n                  \"displayName\": \"대한민국\"\n                }\n              ]\n            }\n          ]",
            "\"fields\": []"
        );
        String nullOptions = fixture().replace(
            "\"options\": [\n                {\n                  \"optionId\": \"option-1\",\n                  \"displayName\": \"대한민국\"\n                }\n              ]",
            "\"options\": null"
        );

        assertThat(emptyItemFields).contains("\"fields\": []");
        assertThat(nullOptions).contains("\"options\": null");

        for (String request : List.of(emptyItemFields, nullOptions)) {
            mockMvc.perform(post("/api/v1/fields/analyze")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(request))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
    }

    private static String fixture() throws Exception {
        return new ClassPathResource("formanalysis/fields-request-v2.json")
            .getContentAsString(StandardCharsets.UTF_8);
    }

    private static String preparationFixture() throws Exception {
        return new ClassPathResource("formanalysis/preparation-request-v2.json")
            .getContentAsString(StandardCharsets.UTF_8);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeResolverConfiguration {

        @Bean
        @Primary
        FakeFieldMappingResolver fakeFieldMappingResolver() {
            return new FakeFieldMappingResolver();
        }
    }

    static final class FakeFieldMappingResolver implements FieldMappingResolver {

        private Function<FieldsSnapshot, FieldMappingResolution> behavior;

        void respondWith(Function<FieldsSnapshot, FieldMappingResolution> behavior) {
            this.behavior = behavior;
        }

        @Override
        public FieldMappingResolution resolve(FieldsSnapshot snapshot) {
            return behavior.apply(snapshot);
        }
    }
}
