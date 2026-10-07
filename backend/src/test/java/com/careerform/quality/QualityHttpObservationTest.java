package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;
import com.careerform.formanalysis.application.port.AnalysisRouteObserver;
import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@DisplayName("분석 응답 계약을 보존하는 HTTP 품질 관측")
class QualityHttpObservationTest {
    private final QualityStore store = mock(QualityStore.class);
    private final QualityCollectionService collector = new QualityCollectionService(store,
        Clock.fixed(Instant.parse("2030-01-01T00:00:00Z"), ZoneOffset.UTC), "test", "test-build");
    private final String request = """
        {"schemaVersion":2,"snapshotId":"sample","site":{"host":"example.test","pathPattern":"/synthetic"},
         "sections":[{"sectionId":"s1","fields":[{"candidateId":"f1","element":"input","control":"text","visibility":"visible"}]}]}
        """;

    @RestController
    static class Controller {
        @PostMapping("/api/v1/fields/analyze")
        FieldsAnalysisResponse analyze(@jakarta.validation.Valid @RequestBody FieldsAnalysisRequest request) {
            if (request.snapshotId().equals("fail")) { throw new IllegalStateException("synthetic failure"); }
            QualityScope.record(new AnalysisRouteObserver.Decision(AnalysisRouteObserver.Operation.FIELDS, RouteKind.GENERIC, false, null, null));
            var metrics = new ExternalCallMetrics(new SimpleMeterRegistry(), java.util.Optional.of(new QualityAiObserver()));
            metrics.record("openai", "analysis", 50_000_000, false, false);
            return FieldsAnalysisResponse.complete(request.snapshotId(), List.of());
        }
    }

    @Test
    @DisplayName("응답 JSON을 바꾸지 않고 실제 AI 호출과 수집 건수를 기록한다")
    void preservesResponseAndObservesRealCalls() throws Exception {
        when(store.insert(any())).thenReturn(true);
        var mvc = MockMvcBuilders.standaloneSetup(new Controller())
            .setControllerAdvice(new QualityBodyAdvice(collector))
            .addFilters(new QualityObservationFilter(collector)).build();
        mvc.perform(post("/api/v1/fields/analyze").contentType(MediaType.APPLICATION_JSON).content(request))
            .andExpect(status().isOk()).andExpect(jsonPath("snapshotId").value("sample"))
            .andExpect(jsonPath("quality").doesNotExist());
        var captured = org.mockito.ArgumentCaptor.forClass(QualityRecord.class);
        verify(store).insert(captured.capture());
        var event = (QualityCollectionService.RequestEvent) captured.getValue().payload();
        assertThat(event.counts().discovered()).isEqualTo(1);
        assertThat(event.calls()).containsExactly(new QualityCollectionService.AiCall("openai", "analysis", "success", 50));
        assertThat(event.resultState()).isEqualTo("COMPLETE");
        assertThat(event.reasons()).containsEntry("MAPPING|NOT_MAPPED|TEXT", 1L);
        assertThat(QualityScope.current()).isEmpty();
    }

    @Test
    @DisplayName("품질 저장 실패가 분석 응답과 다음 요청의 scope를 오염시키지 않는다")
    void isolatesStorageFailure() throws Exception {
        when(store.insert(any())).thenThrow(new IllegalStateException("synthetic-store-failure"));
        var mvc = MockMvcBuilders.standaloneSetup(new Controller())
            .setControllerAdvice(new QualityBodyAdvice(collector))
            .addFilters(new QualityObservationFilter(collector)).build();
        mvc.perform(post("/api/v1/fields/analyze").contentType(MediaType.APPLICATION_JSON).content(request))
            .andExpect(status().isOk());
        assertThat(QualityScope.current()).isEmpty();
    }

    @Test
    @DisplayName("잘못된 JSON도 결과 미관측 요청으로 수집한다")
    void recordsRejectedRequest() throws Exception {
        when(store.insert(any())).thenReturn(true);
        var mvc = MockMvcBuilders.standaloneSetup(new Controller())
            .setControllerAdvice(new QualityBodyAdvice(collector))
            .addFilters(new QualityObservationFilter(collector)).build();
        mvc.perform(post("/api/v1/fields/analyze").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().is4xxClientError());
        verify(store).insert(any());
        assertThat(QualityScope.current()).isEmpty();
    }

    @Test
    void recordsUnhandledFailureAsFiveHundred() throws Exception {
        when(store.insert(any())).thenReturn(true);
        var mvc = MockMvcBuilders.standaloneSetup(new Controller()).setControllerAdvice(new QualityBodyAdvice(collector))
            .addFilters(new QualityObservationFilter(collector)).build();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> mvc.perform(post("/api/v1/fields/analyze")
            .contentType(MediaType.APPLICATION_JSON).content(request.replace("sample", "fail"))))
            .isInstanceOf(jakarta.servlet.ServletException.class);
        var captured = org.mockito.ArgumentCaptor.forClass(QualityRecord.class);
        verify(store).insert(captured.capture());
        assertThat(((QualityCollectionService.RequestEvent) captured.getValue().payload()).status()).isEqualTo(500);
    }
}
