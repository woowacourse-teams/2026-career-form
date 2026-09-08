package com.careerform.formanalysis.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false"
})
@AutoConfigureMockMvc
@Import({
    PreparationAnalysisApiTest.FakeResolverConfiguration.class,
    NotRegisteredPolicyConfiguration.class
})
@DisplayName("준비 분석 API")
class PreparationAnalysisApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FakeActionResolver resolver;

    @BeforeEach
    @DisplayName("가짜 action Resolver를 기본 NO_ACTION 응답으로 초기화한다")
    void resetResolver() {
        resolver.respondWith(snapshot -> new ActionResolver.Resolution(
            2,
            snapshot.snapshotId(),
            snapshot.actionCandidateIdsInTraversalOrder().stream()
                .map(ActionResolver.NoAction::new)
                .map(ActionResolver.Result.class::cast)
                .toList()
        ));
    }

    @Test
    @DisplayName("항상 등록된 endpoint로 준비 snapshot을 분석한다")
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
    @DisplayName("애플리케이션 자체의 65KB 제한 없이 준비 분석 요청을 처리한다")
    void acceptsPreparationRequestLargerThanLegacyApplicationLimit() throws Exception {
        String request = requestLargerThanLegacyApplicationLimit();

        assertThat(request.getBytes(StandardCharsets.UTF_8).length).isGreaterThan(65_536);

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"));
    }

    @Test
    @DisplayName("준비 endpoint에서 필드 분석 계약을 거부한다")
    void rejectsFieldsContractAtPreparationEndpoint() throws Exception {
        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fieldsFixture()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("알 수 없는 속성을 노출하지 않고 거부한다")
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
    @DisplayName("준비 snapshot의 candidate ID 중복을 거부한다")
    void rejectsDuplicateCandidateRelationship() throws Exception {
        String request = fixture().replace("action-item", "action-direct");

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("준비 snapshot의 section ID 중복을 거부한다")
    void rejectsDuplicateSectionIds() throws Exception {
        String request = fixture().replace("section-target", "section-actions");

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("schemaVersion 2가 아닌 요청을 거부한다")
    void rejectsUnsupportedSchemaVersion() throws Exception {
        String request = fixture().replace("\"schemaVersion\": 2", "\"schemaVersion\": 1");

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("준비 요청에서 JSON 기본 타입 자동 변환을 거부한다")
    void rejectsCoercibleScalarTypes() throws Exception {
        List<String> invalidRequests = List.of(
            fixture().replace("\"schemaVersion\": 2", "\"schemaVersion\": \"2\""),
            fixture().replace("\"schemaVersion\": 2", "\"schemaVersion\": 2.5"),
            fixture().replace(
                "\"snapshotId\": \"snapshot-preparation-1\"",
                "\"snapshotId\": 42"
            ),
            fixture().replace(
                "\"displayName\": \"학력 추가\"",
                "\"displayName\": \"학력 추가\", \"disabled\": \"true\""
            ),
            fixture().replace(
                "\"element\": \"button\"",
                "\"element\": 0"
            )
        );

        for (String request : invalidRequests) {
            mockMvc.perform(post("/api/v1/preparation/analyze")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(request))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
    }

    @Test
    @DisplayName("선택 필드의 명시적 null을 생략과 동일하게 처리한다")
    void acceptsExplicitNullForOptionalValue() throws Exception {
        String explicitNull = fixture().replace(
            "\"displayName\": \"학력 추가\"",
            "\"displayName\": null"
        );

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(explicitNull))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("필수 필드의 명시적 null을 거부한다")
    void rejectsExplicitNullForRequiredValue() throws Exception {
        String explicitNull = fixture().replace(
            "\"candidateId\": \"action-direct\"",
            "\"candidateId\": null"
        );

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(explicitNull))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("비어 있거나 false인 선택 필드를 거부한다")
    void rejectsEmptyAndFalseOptionalValues() throws Exception {
        String empty = fixture().replace(
            "\"displayName\": \"학력 추가\"",
            "\"displayName\": \"\""
        );
        String falseFlag = fixture().replace(
            "\"displayName\": \"학력 추가\"",
            "\"displayName\": \"학력 추가\", \"disabled\": false"
        );

        for (String request : List.of(empty, falseFlag)) {
            mockMvc.perform(post("/api/v1/preparation/analyze")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(request))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
    }

    @Test
    @DisplayName("문자열의 절대 길이 제한을 넘으면 거부한다")
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
    @DisplayName("예상하지 못한 애플리케이션 오류를 일반화한 500 응답으로 바꾼다")
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

    private static String requestLargerThanLegacyApplicationLimit() {
        String candidates = IntStream.range(0, 700)
            .mapToObj(index -> """
                {
                  "candidateId": "action-%d",
                  "element": "button",
                  "control": "button",
                  "visibility": "visible",
                  "displayName": "합성 액션"
                }
                """.formatted(index))
            .collect(Collectors.joining(","));

        return """
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-preparation-large",
              "site": {
                "host": "example.test",
                "pathPattern": "/application/*"
              },
              "sections": [
                {
                  "sectionId": "section-actions",
                  "actionCandidates": [%s]
                }
              ]
            }
            """.formatted(candidates);
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

        private Function<PreparationAnalysisRequest, Resolution> behavior;

        void respondWith(
            Function<PreparationAnalysisRequest, Resolution> behavior
        ) {
            this.behavior = behavior;
        }

        @Override
        public Resolution resolve(PreparationAnalysisRequest request) {
            return behavior.apply(request);
        }
    }
}
