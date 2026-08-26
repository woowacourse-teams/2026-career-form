package com.careerform.formanalysis.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
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

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false"
})
@AutoConfigureMockMvc
@Import(FieldsAnalysisApiTest.FakeResolverConfiguration.class)
@DisplayName("필드 분석 API")
class FieldsAnalysisApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FakeFieldMappingResolver resolver;

    @BeforeEach
    @DisplayName("가짜 field Resolver를 기본 NO_MATCH 응답으로 초기화한다")
    void resetResolver() {
        resolver.respondWith(snapshot -> new FieldMappingResolver.Resolution(
            2,
            snapshot.snapshotId(),
            snapshot.fieldCandidateIdsInTraversalOrder().stream()
                .map(FieldMappingResolver.NoMatch::new)
                .map(FieldMappingResolver.Result.class::cast)
                .toList()
        ));
    }

    @Test
    @DisplayName("항상 등록된 endpoint로 모든 필드를 분석한다")
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
    @DisplayName("애플리케이션 자체의 65KB 제한 없이 필드 분석 요청을 처리한다")
    void acceptsFieldsRequestLargerThanLegacyApplicationLimit() throws Exception {
        String request = requestLargerThanLegacyApplicationLimit();

        assertThat(request.getBytes(StandardCharsets.UTF_8).length).isGreaterThan(65_536);

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"));
    }

    @Test
    @DisplayName("필드 endpoint에서 준비 분석 계약을 거부한다")
    void rejectsPreparationContractAtFieldsEndpoint() throws Exception {
        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(preparationFixture()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("필드 snapshot의 candidate ID 중복을 거부한다")
    void rejectsDuplicateCandidateIds() throws Exception {
        String request = fixture().replace("field-item", "field-direct");

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("필드 snapshot에서는 section ID 중복을 허용한다")
    void acceptsDuplicateSectionIds() throws Exception {
        String request = """
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-duplicate-sections",
              "site": {
                "host": "example.test",
                "pathPattern": "/application/*"
              },
              "sections": [
                {"sectionId": "same-section", "fields": []},
                {"sectionId": "same-section", "fields": []}
              ]
            }
            """;

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"));
    }

    @Test
    @DisplayName("schemaVersion 2가 아닌 요청을 거부한다")
    void rejectsUnsupportedSchemaVersion() throws Exception {
        String request = fixture().replace("\"schemaVersion\": 2", "\"schemaVersion\": 1");

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("깨진 JSON 요청을 거부한다")
    void rejectsMalformedJson() throws Exception {
        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"schemaVersion\":2"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("site와 metadata의 길이 제한을 넘으면 거부한다")
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
    @DisplayName("항목의 빈 필드 목록을 거부한다")
    void rejectsEmptyItemFields() throws Exception {
        String emptyItemFields = fixture().replace(
            "\"fields\": [\n            {\n              \"candidateId\": \"field-item\",\n              \"element\": \"select\",\n              \"control\": \"select\",\n              \"visibility\": \"visible\",\n              \"displayName\": \"국적\",\n              \"options\": [\n                {\n                  \"optionId\": \"option-1\",\n                  \"displayName\": \"대한민국\"\n                }\n              ]\n            }\n          ]",
            "\"fields\": []"
        );
        assertThat(emptyItemFields).contains("\"fields\": []");

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(emptyItemFields))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("선택 목록의 명시적 null을 생략과 동일하게 처리한다")
    void acceptsExplicitNullForOptionalOptions() throws Exception {
        String nullOptions = fixture().replace(
            "\"options\": [\n                {\n                  \"optionId\": \"option-1\",\n                  \"displayName\": \"대한민국\"\n                }\n              ]",
            "\"options\": null"
        );

        assertThat(nullOptions).contains("\"options\": null");

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(nullOptions))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("필수 필드의 명시적 null을 거부한다")
    void rejectsExplicitNullForRequiredValue() throws Exception {
        String explicitNull = fixture().replace(
            "\"candidateId\": \"field-direct\"",
            "\"candidateId\": null"
        );

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(explicitNull))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    private static String fixture() throws Exception {
        return new ClassPathResource("formanalysis/fields-request-v2.json")
            .getContentAsString(StandardCharsets.UTF_8);
    }

    private static String preparationFixture() throws Exception {
        return new ClassPathResource("formanalysis/preparation-request-v2.json")
            .getContentAsString(StandardCharsets.UTF_8);
    }

    private static String requestLargerThanLegacyApplicationLimit() {
        String candidates = IntStream.range(0, 700)
            .mapToObj(index -> """
                {
                  "candidateId": "field-%d",
                  "element": "input",
                  "control": "text",
                  "visibility": "visible",
                  "displayName": "합성 필드"
                }
                """.formatted(index))
            .collect(Collectors.joining(","));

        return """
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-fields-large",
              "site": {
                "host": "example.test",
                "pathPattern": "/application/*"
              },
              "sections": [
                {
                  "sectionId": "section-fields",
                  "fields": [%s]
                }
              ]
            }
            """.formatted(candidates);
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

        private Function<FieldsAnalysisRequest, Resolution> behavior;

        void respondWith(Function<FieldsAnalysisRequest, Resolution> behavior) {
            this.behavior = behavior;
        }

        @Override
        public Resolution resolve(FieldsAnalysisRequest request) {
            return behavior.apply(request);
        }
    }
}
