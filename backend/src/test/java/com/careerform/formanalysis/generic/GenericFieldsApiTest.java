package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.analysis.enabled=true",
    "career-form.analysis.provider=jev",
    "career-form.analysis.jev.api-key=synthetic-test-key",
    "career-form.analysis.jev.data-policy-reviewed=true"
})
@AutoConfigureMockMvc
@Import(GenericFieldsApiTest.SyntheticPolicyConfiguration.class)
@DisplayName("범용 섹션별 칸 매칭 API")
class GenericFieldsApiTest {

    private static final String SYNTHETIC_PROFILE_VALUE = "SYNTHETIC_PRIVATE_8421";
    private static final String SYNTHETIC_CURRENT_VALUE = "SYNTHETIC_CURRENT_5513";
    private static final String SYNTHETIC_LABEL = "SYNTHETIC_LABEL_3307";
    private static final String SYNTHETIC_OPTION = "SYNTHETIC_OPTION_6620";
    private static final String SYNTHETIC_DOM = "SYNTHETIC_DOM_7731";
    private static final Set<String> FIELD_KEYS = Set.of("candidateId", "profileFieldKey", "confidence",
        "categoryConfirmed", "reason", "autofillPolicy", "interactionStatus", "writePlan");
    private static final String STATIC_HOST = "static-policy.example.test";
    private static final String SCHOOL = "education.university.schoolName";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JevClient jevClient;

    @Autowired
    private Environment environment;

    private GenericFieldsJevHttp http;

    @BeforeEach
    void captureJevHttp() {
        http = new GenericFieldsJevHttp();
        GenericFieldsJevHttp.install(jevClient, http);
    }

    @Test
    @DisplayName("칸별 매핑과 진단을 돌려주고 모든 공급자 요청 본문에 값, 현재 입력값, 항목 개수를 보내지 않는다")
    void mapsFieldsThroughAnswerWithoutSendingValues() throws Exception {
        http.respond(call -> GenericFieldsJevHttp.answers(call, Map.of("field_0", SCHOOL), 0.42));

        var result = mockMvc.perform(post("/api/v1/generic/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestJson("example.test", false)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.schemaVersion").value(2))
            .andExpect(jsonPath("$.status").value("COMPLETE"))
            .andExpect(jsonPath("$.snapshotId").value("synthetic-snapshot"))
            .andExpect(jsonPath("$.fields.length()").value(2))
            .andExpect(jsonPath("$.fields[0].candidateId").value("cand-school"))
            .andExpect(jsonPath("$.fields[0].profileFieldKey").value(SCHOOL))
            .andExpect(jsonPath("$.fields[0].confidence").value(0.42))
            .andExpect(jsonPath("$.fields[0].categoryConfirmed").value(true))
            .andExpect(jsonPath("$.fields[0].reason").doesNotExist())
            .andExpect(jsonPath("$.fields[0].autofillPolicy").value("CONDITIONAL"))
            .andExpect(jsonPath("$.fields[0].interactionStatus").value("READY"))
            .andExpect(jsonPath("$.fields[0].writePlan.command").value("SET_TEXT"))
            .andExpect(jsonPath("$.fields[1].candidateId").value("cand-grade"))
            .andExpect(jsonPath("$.fields[1].interactionStatus").value("BLOCKED"))
            .andExpect(jsonPath("$.fields[1].autofillPolicy").doesNotExist())
            .andExpect(jsonPath("$.fields[1].writePlan").doesNotExist())
            .andExpect(jsonPath("$.diagnostics.jevCalls").value(1))
            .andExpect(jsonPath("$.diagnostics.elapsedMs").isNumber())
            .andReturn();

        String responseBody = result.getResponse().getContentAsString();
        assertThat(responseBody).contains("\"profileFieldKey\":null").doesNotContain(SYNTHETIC_PROFILE_VALUE,
            SYNTHETIC_CURRENT_VALUE, SYNTHETIC_LABEL, SYNTHETIC_OPTION, SYNTHETIC_DOM, "학교명", "학점");
        var fields = GenericFieldsJevHttp.JSON.readTree(responseBody).path("fields");
        assertThat(fields.size()).isEqualTo(2);
        for (var field : fields) {
            Set<String> keys = new java.util.HashSet<>();
            field.propertyNames().forEach(keys::add);
            assertThat(FIELD_KEYS).containsAll(keys);
            if (keys.contains("writePlan")) {
                List<String> planKeys = new java.util.ArrayList<>();
                field.path("writePlan").propertyNames().forEach(planKeys::add);
                assertThat(planKeys).containsExactly("command");
            }
        }
        assertThat(http.bodies()).hasSize(1).allSatisfy(body -> assertThat(body).doesNotContain(
            SYNTHETIC_PROFILE_VALUE, SYNTHETIC_CURRENT_VALUE, "profileItemCount", "currentValue", "\"value\"",
            "cand-school", "edu-block"));
        var call = http.calls().getFirst();
        assertThat(call.request().path("questions").path("field_0").path("type").asString()).isEqualTo("choice");
        assertThat(call.criteria("field_0")).allMatch(key -> key.startsWith("education.") || key.equals("ABSTAIN"));
    }

    @Test
    @DisplayName("정적 정책 host 요청은 JEV를 호출하지 않고 빈 칸 목록의 STATIC_POLICY_PRESENT를 반환한다")
    void staticPolicyHostDoesNotCallJev() throws Exception {
        mockMvc.perform(post("/api/v1/generic/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestJson(STATIC_HOST, false)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.schemaVersion").value(2))
            .andExpect(jsonPath("$.status").value("STATIC_POLICY_PRESENT"))
            .andExpect(jsonPath("$.fields.length()").value(0));

        assertThat(http.bodies()).isEmpty();
    }

    @Test
    @DisplayName("프로필 값, 현재 입력값, 항목 개수 필드를 담은 요청은 400으로 거부하고 JEV를 호출하지 않는다")
    void rejectsValueFieldsAtTheBoundary() throws Exception {
        mockMvc.perform(post("/api/v1/generic/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestJson("example.test", true)))
            .andExpect(status().isBadRequest());

        assertThat(http.bodies()).isEmpty();
    }

    @Test
    @DisplayName("섹션 동시 3개, 배치 5개, 서버 동시 10개가 기본 설정이다")
    void defaultsAreFixedInConfiguration() {
        assertThat(environment.getProperty("career-form.analysis.jev.section-concurrency", Integer.class)).isEqualTo(3);
        assertThat(environment.getProperty("career-form.analysis.jev.field-batch-size", Integer.class)).isEqualTo(5);
        assertThat(environment.getProperty("career-form.analysis.jev.max-concurrent", Integer.class)).isEqualTo(10);
    }

    private static String requestJson(String host, boolean withValues) {
        var school = new LinkedHashMap<String, Object>();
        school.put("candidateId", "cand-school");
        school.put("element", "input");
        school.put("control", "text");
        school.put("visibility", "visible");
        school.put("displayName", "학교명 " + SYNTHETIC_PROFILE_VALUE);
        school.put("domId", SYNTHETIC_DOM);
        school.put("domName", SYNTHETIC_DOM + "-name");
        school.put("placeholder", SYNTHETIC_PROFILE_VALUE);
        school.put("semanticContext", Map.of("labels", List.of(
            Map.of("source", "label", "text", "학교명 " + SYNTHETIC_LABEL))));
        if (withValues) {
            school.put("value", SYNTHETIC_PROFILE_VALUE);
            school.put("currentValue", SYNTHETIC_CURRENT_VALUE);
        }
        var grade = new LinkedHashMap<String, Object>();
        grade.put("candidateId", "cand-grade");
        grade.put("element", "select");
        grade.put("control", "select");
        grade.put("visibility", "visible");
        grade.put("displayName", "학점");
        grade.put("options", List.of(Map.of("optionId", "opt-1", "displayName", SYNTHETIC_OPTION),
            Map.of("optionId", "opt-2", "displayName", SYNTHETIC_CURRENT_VALUE)));
        var section = new LinkedHashMap<String, Object>();
        section.put("sectionId", "edu-block");
        section.put("displayName", "학력 " + SYNTHETIC_PROFILE_VALUE);
        section.put("category", "EDUCATION");
        section.put("fields", List.of(school, grade));
        var request = new LinkedHashMap<String, Object>();
        request.put("schemaVersion", 2);
        request.put("snapshotId", "synthetic-snapshot");
        request.put("site", Map.of("host", host, "pathPattern", "/apply"));
        if (withValues) {
            request.put("profileItemCount", 7);
        }
        request.put("sections", List.of(section));
        return GenericFieldsJevHttp.JSON.writeValueAsString(request);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class SyntheticPolicyConfiguration {
        @Bean
        @Primary
        CompanyFormPolicyProvider syntheticCompanyFormPolicyProvider() {
            return (host, path) -> STATIC_HOST.equals(host)
                ? new CompanyFormPolicyProvider.Available(CompanyFormPolicyFixture.sk())
                : new CompanyFormPolicyProvider.NotRegistered();
        }

        @Bean
        @Primary
        GreetingDomainEvidence syntheticGreetingDomainEvidence() {
            return (host, path) -> GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE;
        }
    }
}
