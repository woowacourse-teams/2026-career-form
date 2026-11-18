package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;

import io.micrometer.core.instrument.MeterRegistry;
import tools.jackson.databind.JsonNode;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.analysis.enabled=true",
    "career-form.analysis.provider=jev",
    "career-form.analysis.jev.api-key=synthetic-test-key",
    "career-form.analysis.jev.data-policy-reviewed=true"
})
@AutoConfigureMockMvc
@Import(GenericFieldsApiTest.SyntheticPolicyConfiguration.class)
@DisplayName("범용 칸 분석 API의 섹션 단위 결과 캐시")
class GenericSectionAnswerCacheApiTest {

    private static final String COMPANY = "careers.career.companyName";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JevClient jevClient;

    @Autowired
    private MeterRegistry registry;

    @Autowired
    private Environment environment;

    private GenericFieldsJevHttp http;

    @BeforeEach
    void captureJevHttp() {
        http = new GenericFieldsJevHttp();
        GenericFieldsJevHttp.install(jevClient, http);
    }

    @Test
    @DisplayName("같은 섹션을 다른 사이트에서 다시 보내면 공급자를 부르지 않고 응답 형식과 매핑은 그대로다")
    void repeatedSectionIsServedFromCacheWithSameResponseShape() throws Exception {
        http.respond(call -> GenericFieldsJevHttp.answers(call, Map.of("field_0", COMPANY), 0.91));
        double hitsBefore = count("hit");
        double missesBefore = count("miss");

        JsonNode first = analyze("snapshot-first", "cache-first.example.test", "/apply", "cand-1");
        JsonNode second = analyze("snapshot-second", "cache-second.example.test", "/recruit/form", "cand-9");

        assertThat(http.calls()).hasSize(1);
        assertThat(first.path("diagnostics").path("jevCalls").asInt()).isEqualTo(1);
        assertThat(second.path("status").asString()).isEqualTo("COMPLETE");
        assertThat(second.path("snapshotId").asString()).isEqualTo("snapshot-second");
        assertThat(second.path("diagnostics").path("jevCalls").asInt()).isZero();
        assertThat(names(second.path("diagnostics"))).containsExactlyInAnyOrder("jevCalls", "elapsedMs");
        assertThat(names(second)).isEqualTo(names(first));
        assertThat(second.path("fields").size()).isEqualTo(1);
        JsonNode cached = second.path("fields").get(0);
        JsonNode asked = first.path("fields").get(0);
        assertThat(asked.path("candidateId").asString()).isEqualTo("cand-1");
        assertThat(cached.path("candidateId").asString()).isEqualTo("cand-9");
        assertThat(cached.path("profileFieldKey").asString()).isEqualTo(COMPANY);
        assertThat(names(cached)).isEqualTo(names(asked));
        for (String name : names(asked)) {
            if (!"candidateId".equals(name)) {
                assertThat(cached.path(name)).as(name).isEqualTo(asked.path(name));
            }
        }
        assertThat(count("hit") - hitsBefore).isEqualTo(1.0);
        assertThat(count("miss") - missesBefore).isEqualTo(1.0);
    }

    @Test
    @DisplayName("섹션 5,000개와 7일이 기본 설정이고 기본으로 켜져 있다")
    void defaultsAreFixedInConfiguration() {
        String prefix = "career-form.analysis.jev.section-cache.";
        assertThat(environment.getProperty(prefix + "enabled", Boolean.class)).isTrue();
        assertThat(environment.getProperty(prefix + "max-sections", Long.class)).isEqualTo(5000L);
        assertThat(environment.getProperty(prefix + "ttl", java.time.Duration.class))
            .isEqualTo(java.time.Duration.ofDays(7));
    }

    private double count(String outcome) {
        return registry.get(SectionAnswerCache.METRIC).tag("outcome", outcome).counter().count();
    }

    private JsonNode analyze(String snapshotId, String host, String path, String candidateId) throws Exception {
        var company = new LinkedHashMap<String, Object>();
        company.put("candidateId", candidateId);
        company.put("element", "input");
        company.put("control", "text");
        company.put("visibility", "visible");
        company.put("displayName", "회사명");
        var section = new LinkedHashMap<String, Object>();
        section.put("sectionId", "career-" + candidateId);
        section.put("displayName", "경력");
        section.put("category", "CAREER");
        section.put("fields", List.of(company));
        var request = new LinkedHashMap<String, Object>();
        request.put("schemaVersion", 2);
        request.put("snapshotId", snapshotId);
        request.put("site", Map.of("host", host, "pathPattern", path));
        request.put("sections", List.of(section));
        String body = mockMvc.perform(post("/api/v1/generic/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(GenericFieldsJevHttp.JSON.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return GenericFieldsJevHttp.JSON.readTree(body);
    }

    private static List<String> names(JsonNode node) {
        List<String> names = new ArrayList<>();
        node.propertyNames().forEach(names::add);
        return names;
    }
}
