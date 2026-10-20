package com.careerform.quality;

import java.lang.reflect.Type;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;

@ControllerAdvice
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityBodyAdvice extends RequestBodyAdviceAdapter implements ResponseBodyAdvice<Object> {
    private static final Logger log = LoggerFactory.getLogger(QualityBodyAdvice.class);
    private final QualityAsyncService observations;

    public QualityBodyAdvice(QualityAsyncService observations) { this.observations = observations; }

    @Override
    public boolean supports(MethodParameter parameter, Type type, Class<? extends HttpMessageConverter<?>> converter) {
        return type == FieldsAnalysisRequest.class || type == PreparationAnalysisRequest.class || type == InteractionDecisionRequest.class;
    }

    @Override
    public Object afterBodyRead(Object body, HttpInputMessage input, MethodParameter parameter, Type type, Class<? extends HttpMessageConverter<?>> converter) {
        QualityScope.current().ifPresent(scope -> scope.request(body));
        return body;
    }

    @Override
    public boolean supports(MethodParameter parameter, Class<? extends HttpMessageConverter<?>> converter) { return QualityScope.current().isPresent(); }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter parameter, MediaType contentType, Class<? extends HttpMessageConverter<?>> converter,
                                  ServerHttpRequest request, ServerHttpResponse response) {
        var scope = QualityScope.current().orElse(null);
        if (scope == null || scope.observed()) { return body; }
        try {
            scope.observed(true);
            observations.observeCaptured(budget -> capture(scope, body, request, response, budget));
            response.getHeaders().set("Cache-Control", "no-store");
        } catch (RuntimeException exception) {
            log.warn("QUALITY_RESPONSE_OBSERVATION_UNAVAILABLE");
        }
        return body;
    }

    private QualityObservationCapture capture(QualityScope scope, Object body, ServerHttpRequest request,
                                               ServerHttpResponse response, QualityCaptureBudget budget) {
        var snapshot = scope.request() instanceof FieldsAnalysisRequest fields && body instanceof FieldsAnalysisResponse result
            ? QualityCapturedSnapshot.from(fields, result, budget) : null;
        var host = budget.text(scope.request() instanceof FieldsAnalysisRequest fields ? fields.site().host()
            : scope.request() instanceof PreparationAnalysisRequest preparation ? preparation.site().host()
            : scope.request() instanceof InteractionDecisionRequest interaction ? interaction.site().host() : "UNKNOWN", 253);
        var decision = scope.decision().orElse(null);
        var route = decision == null ? "UNKNOWN" : decision.kind() == RouteKind.GENERIC ? "GENERIC" : decision.greeting() ? "GREETING"
            : decision.companyKey() != null ? "STATIC" : "UNKNOWN";
        var publicLink = snapshot == null ? null : budget.text(QualityPublicLinks.validate(host, request.getHeaders().getFirst("X-Career-Form-Public-Application")), 512);
        var connection = observations.connection(request.getHeaders().getFirst("X-Career-Form-Quality-Run"),
            request.getHeaders().getFirst("X-Career-Form-Quality-Key"));
        budget.text(connection, 64);
        var extension = budget.text(request.getHeaders().getFirst("X-Career-Form-Version"), 128);
        var calls = budget.calls(scope.calls());
        var event = new QualityCollectionService.RequestEvent(decision == null ? "UNKNOWN" : decision.operation().name(),
            response instanceof org.springframework.http.server.ServletServerHttpResponse servlet ? servlet.getServletResponse().getStatus() : 200,
            scope.durationMs(), null, calls, decision == null ? "UNKNOWN" : decision.kind().name(),
            budget.text(org.slf4j.MDC.get("requestId"), 128), resultState(body), java.util.Map.of());
        var metadata = new QualityAsyncService.Observation(connection, host, budget.text(decision == null ? null : decision.companyKey(), 128),
            decision != null && decision.greeting(), route, decision == null ? null : decision.policyVersion(), extension, publicLink, event, null);
        return new QualityObservationCapture(metadata, snapshot);
    }

    private String resultState(Object body) {
        if (body instanceof FieldsAnalysisResponse fields) {
            if (fields.blockCode() != null) { return fields.blockCode().name(); }
            if (fields.warningCodes() != null && fields.warningCodes().contains(FieldsAnalysisResponse.WarningCode.LLM_UNAVAILABLE)) { return "LLM_UNAVAILABLE"; }
            return fields.analysisStatus().name();
        }
        if (body instanceof com.careerform.formanalysis.dto.PreparationAnalysisResponse preparation) {
            if (preparation.blockCode() != null) { return preparation.blockCode().name(); }
            if (preparation.warningCodes() != null && preparation.warningCodes().contains(com.careerform.formanalysis.dto.PreparationAnalysisResponse.WarningCode.LLM_UNAVAILABLE)) { return "LLM_UNAVAILABLE"; }
            return preparation.analysisStatus().name();
        }
        if (body instanceof com.careerform.formanalysis.dto.InteractionDecisionResponse interaction) { return interaction.status().name(); }
        return "UNKNOWN";
    }
}
