package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;
import com.careerform.formanalysis.application.port.AnalysisRouteObserver;
import com.careerform.formanalysis.generic.GenericFieldsRequest;
import com.careerform.formanalysis.generic.GenericFieldsResponse;
import com.careerform.formanalysis.generic.SectionClassificationRequest;
import com.careerform.formanalysis.generic.SectionClassificationResponse;
import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("범용 분류와 칸 매칭 경로의 HTTP 품질 관측")
class QualityGenericObservationTest {
    @org.junit.jupiter.api.extension.RegisterExtension
    final QualityTestRuntime runtime = new QualityTestRuntime();
    private static final String CLASSIFY = "/api/v1/generic/sections/classify";
    private static final String FIELDS = "/api/v1/generic/fields/analyze";
    private static final String LABEL = "SYNTHETIC_LABEL_6604";
    private static final String TITLE = "SYNTHETIC_TITLE_3318";
    private static final String OPTION = "SYNTHETIC_OPTION_2275";
    private static final String OPTION_ID = "optSecret4410";
    private static final String HOST = "synthetic-host-8841.example";
    private static final String SNAPSHOT = "snapSecret9910";
    private static final String CANDIDATE = "candSecret5521";
    private static final String SECTION = "secSecret7731";
    private static final String PROFILE_KEY = "education.university.schoolName";
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final Map<String, String> REQUESTS = Map.of(
        CLASSIFY, """
            {"schemaVersion":1,"snapshotId":"%s","site":{"host":"%s","pathPattern":"/synthetic"},
             "sections":[{"sectionId":"%s","title":"%s","labels":["%s"],"controlKinds":["TEXT","SELECT"],"repeated":false}]}
            """.formatted(SNAPSHOT, HOST, SECTION, TITLE, LABEL),
        FIELDS, """
            {"schemaVersion":2,"snapshotId":"%s","site":{"host":"%s","pathPattern":"/synthetic"},
             "sections":[{"sectionId":"%s","category":"education","fields":[{"candidateId":"%s","element":"select",
             "control":"select","visibility":"visible","displayName":"%s","options":[{"optionId":"%s","displayName":"%s"}]}]}]}
            """.formatted(SNAPSHOT, HOST, SECTION, CANDIDATE, LABEL, OPTION_ID, OPTION));

    private final QualityStore store = mock(QualityStore.class);
    private final QualityCollectionService collector = new QualityCollectionService(store,
        Clock.fixed(Instant.parse("2030-01-01T00:00:00Z"), ZoneOffset.UTC), "test", "test-build");

    @RestController
    static class Controller {
        @PostMapping(CLASSIFY)
        SectionClassificationResponse classify(@jakarta.validation.Valid @RequestBody SectionClassificationRequest request) {
            if (request.snapshotId().equals("fail")) { throw new IllegalStateException("synthetic failure"); }
            routeGeneric();
            return SectionClassificationResponse.complete(request.snapshotId(), request.sections().stream()
                .map(section -> new SectionClassificationResponse.Section(section.sectionId(), "education", 0.9)).toList());
        }

        @PostMapping(FIELDS)
        GenericFieldsResponse analyze(@jakarta.validation.Valid @RequestBody GenericFieldsRequest request) {
            if (request.snapshotId().equals("fail")) { throw new IllegalStateException("synthetic failure"); }
            routeGeneric();
            return GenericFieldsResponse.complete(request.snapshotId(), request.fieldCandidateIdsInTraversalOrder().stream()
                .map(id -> new GenericFieldsResponse.Field(id, PROFILE_KEY, 0.9, true, null)).toList(),
                new GenericFieldsResponse.Diagnostics(1, 5));
        }

        @GetMapping({CLASSIFY, FIELDS})
        Map<String, String> read() { return Map.of("state", "read"); }

        @PostMapping({FIELDS + "/extra", "/api/v1/generic/other"})
        Map<String, String> other(@RequestBody String body) {
            routeGeneric();
            return Map.of("state", "other");
        }

        private static void routeGeneric() {
            QualityScope.record(new AnalysisRouteObserver.Decision(AnalysisRouteObserver.Operation.INTERACTION, RouteKind.GENERIC,
                false, null, null));
            new ExternalCallMetrics(new SimpleMeterRegistry(), java.util.Optional.of(new QualityAiObserver()))
                .record("jev", "analysis", 50_000_000, false, false);
        }
    }

    private MockMvc observed() {
        return MockMvcBuilders.standaloneSetup(new Controller()).setControllerAdvice(new QualityBodyAdvice(runtime.service(collector, null)))
            .addFilters(new QualityObservationFilter(runtime.service(collector, null))).build();
    }

    private QualityRecord captured() {
        runtime.await();
        var captor = ArgumentCaptor.forClass(QualityRecord.class);
        verify(store, times(1)).insert(captor.capture());
        return captor.getValue();
    }

    private static void assertNoRequestOrResponseValues(QualityRecord record) {
        assertThat(MAPPER.writeValueAsString(record)).doesNotContain(LABEL, TITLE, OPTION, OPTION_ID, HOST, SNAPSHOT,
            CANDIDATE, SECTION, PROFILE_KEY);
    }

    @ParameterizedTest
    @ValueSource(strings = {CLASSIFY, FIELDS})
    @DisplayName("새 범용 경로 POST를 응답 JSON 변경 없이 값 없는 요청 기록 한 건으로 남긴다")
    void observesGenericPostWithoutValues(String path) throws Exception {
        when(store.insert(any())).thenReturn(true);
        var plain = MockMvcBuilders.standaloneSetup(new Controller()).build()
            .perform(post(path).contentType(MediaType.APPLICATION_JSON).content(REQUESTS.get(path)))
            .andReturn().getResponse().getContentAsString();

        var body = observed().perform(post(path).contentType(MediaType.APPLICATION_JSON).content(REQUESTS.get(path)))
            .andExpect(status().isOk()).andExpect(jsonPath("snapshotId").value(SNAPSHOT))
            .andExpect(jsonPath("quality").doesNotExist())
            .andReturn().getResponse().getContentAsString();

        assertThat(body).isEqualTo(plain);
        var record = captured();
        var event = (QualityCollectionService.RequestEvent) record.payload();
        assertThat(record.kind()).isEqualTo(QualityRecord.Kind.REQUEST);
        assertThat(event.counts()).isNull();
        assertThat(event.operation()).isEqualTo("INTERACTION");
        assertThat(event.routeState()).isEqualTo("GENERIC");
        assertThat(event.resultState()).isEqualTo("UNKNOWN");
        assertThat(event.status()).isEqualTo(200);
        assertThat(event.calls()).containsExactly(new QualityCollectionService.AiCall("jev", "analysis", "success", 50));
        assertThat(record.group().host()).isEqualTo("UNKNOWN");
        assertThat(record.group().site()).isEqualTo("UNKNOWN");
        assertThat(record.group().structure()).isEqualTo("UNKNOWN");
        assertNoRequestOrResponseValues(record);
        assertThat(QualityScope.current()).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({CLASSIFY + ",INTERACTION", FIELDS + ",FIELDS"})
    @DisplayName("잘못된 JSON은 응답 본문 없이 상태 코드만 기록한다")
    void recordsRejectedGenericRequest(String path, String operation) throws Exception {
        when(store.insert(any())).thenReturn(true);
        observed().perform(post(path).contentType(MediaType.APPLICATION_JSON)
                .content("{\"snapshotId\":\"" + SNAPSHOT + "\",\"site\":{\"host\":\"" + HOST + "\""))
            .andExpect(status().isBadRequest());
        var record = captured();
        var event = (QualityCollectionService.RequestEvent) record.payload();
        assertThat(event.status()).isEqualTo(400);
        assertThat(event.operation()).isEqualTo(operation);
        assertThat(event.counts()).isNull();
        assertThat(event.calls()).isEmpty();
        assertNoRequestOrResponseValues(record);
        assertThat(QualityScope.current()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {CLASSIFY, FIELDS})
    @DisplayName("처리되지 않은 예외는 500 상태만 기록한다")
    void recordsUnhandledGenericFailureAsFiveHundred(String path) {
        when(store.insert(any())).thenReturn(true);
        assertThatThrownBy(() -> observed().perform(post(path).contentType(MediaType.APPLICATION_JSON)
            .content(REQUESTS.get(path).replace(SNAPSHOT, "fail"))))
            .isInstanceOf(jakarta.servlet.ServletException.class);
        var record = captured();
        var event = (QualityCollectionService.RequestEvent) record.payload();
        assertThat(event.status()).isEqualTo(500);
        assertThat(event.counts()).isNull();
        assertNoRequestOrResponseValues(record);
        assertThat(QualityScope.current()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {CLASSIFY, FIELDS})
    @DisplayName("새 경로의 GET은 관측하지 않는다")
    void ignoresGetOnGenericPaths(String path) throws Exception {
        observed().perform(get(path)).andExpect(status().isOk()).andExpect(jsonPath("state").value("read"));
        verify(store, never()).insert(any());
    }

    @ParameterizedTest
    @ValueSource(strings = {FIELDS + "/extra", "/api/v1/generic/other"})
    @DisplayName("접미사 경로와 목록에 없는 범용 경로는 관측하지 않는다")
    void ignoresUnlistedGenericPaths(String path) throws Exception {
        observed().perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk()).andExpect(jsonPath("state").value("other"));
        verify(store, never()).insert(any());
    }

    @Test
    @DisplayName("기존 세 경로와 새 두 경로의 필터 대상 판정")
    void keepsExistingPathDecisions() {
        var filter = new QualityObservationFilter(runtime.service(collector, null));
        for (var path : new String[] {"/api/v1/fields/analyze", "/api/v1/preparation/analyze",
            "/api/v1/generic/interaction-decisions", CLASSIFY, FIELDS}) {
            assertThat(filter.shouldNotFilter(new MockHttpServletRequest("POST", path))).as(path).isFalse();
            assertThat(filter.shouldNotFilter(new MockHttpServletRequest("GET", path))).as(path).isTrue();
            assertThat(filter.shouldNotFilter(new MockHttpServletRequest("POST", path + "/extra"))).as(path).isTrue();
        }
        assertThat(filter.shouldNotFilter(new MockHttpServletRequest("POST", "/api/v1/generic/other"))).isTrue();
        assertThat(filter.shouldNotFilter(new MockHttpServletRequest("POST", "/api/v1/fields"))).isTrue();
    }
}
