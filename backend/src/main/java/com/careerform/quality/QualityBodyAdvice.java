package com.careerform.quality;

import java.lang.reflect.Type;
import java.util.Arrays;

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
    private final QualityCollectionService collector;
    private final QualityRegistry registry;

    public QualityBodyAdvice(QualityCollectionService collector) { this(collector, null); }

    @org.springframework.beans.factory.annotation.Autowired
    public QualityBodyAdvice(QualityCollectionService collector, QualityRegistry registry) { this.collector = collector; this.registry = registry; }

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
            var snapshot = scope.request() instanceof FieldsAnalysisRequest fields && body instanceof FieldsAnalysisResponse result
                ? QualityProjection.fields(fields, result) : null;
            var host = scope.request() instanceof FieldsAnalysisRequest fields ? fields.site().host()
                : scope.request() instanceof PreparationAnalysisRequest preparation ? preparation.site().host()
                : scope.request() instanceof InteractionDecisionRequest interaction ? interaction.site().host() : "UNKNOWN";
            var decision = scope.decision().orElse(null);
            var route = decision == null ? "UNKNOWN" : decision.kind() == RouteKind.GENERIC ? "GENERIC" : decision.greeting() ? "GREETING"
                : decision.companyKey() != null ? "STATIC" : "UNKNOWN";
            var identity = host.equals("UNKNOWN") ? null : QualitySite.identify(host, decision == null ? null : decision.companyKey(),
                decision != null && decision.greeting(), registry != null && snapshot != null && registry.dedicated(host.toLowerCase(java.util.Locale.ROOT), snapshot.structureKey()),
                request.getHeaders().getFirst("X-Career-Form-Run") == null
                    ? java.util.UUID.randomUUID().toString() : request.getHeaders().getFirst("X-Career-Form-Run"));
            var group = identity == null ? collector.group("UNKNOWN", "UNKNOWN", "UNKNOWN", null, null)
                : collector.group(identity, snapshot == null ? "UNKNOWN" : snapshot.structureKey(), route,
                decision == null ? null : decision.policyVersion(), request.getHeaders().getFirst("X-Career-Form-Version"));
            var capable = Arrays.stream(request.getHeaders().getOrDefault("X-Career-Form-Capabilities", java.util.List.of()).stream()
                .flatMap(value -> Arrays.stream(value.split(","))).toArray(String[]::new)).anyMatch(value -> value.trim().equals("quality-v1"));
            scope.observed(true);
            var receipt = collector.observe(group, new QualityCollectionService.RequestEvent(decision == null ? "UNKNOWN" : decision.operation().name(),
                response instanceof org.springframework.http.server.ServletServerHttpResponse servlet ? servlet.getServletResponse().getStatus() : 200,
                scope.durationMs(), snapshot == null ? null : snapshot.counts(), scope.calls(), decision == null ? "UNKNOWN" : decision.kind().name(),
                org.slf4j.MDC.get("requestId"), resultState(body), reasons(snapshot)),
                snapshot, request.getHeaders().getFirst("X-Career-Form-Run"), request.getHeaders().getFirst("X-Career-Form-Report-Token"), capable);
            if (receipt != null) {
                response.getHeaders().set("X-Career-Form-Run", receipt.runId());
                response.getHeaders().set("X-Career-Form-Report-Token", receipt.token());
                response.getHeaders().set("Cache-Control", "no-store");
            }
        } catch (RuntimeException exception) {
            log.warn("QUALITY_RESPONSE_OBSERVATION_UNAVAILABLE");
        }
        return body;
    }

    private java.util.Map<String, Long> reasons(QualityProjection.Snapshot snapshot) {
        return snapshot == null ? java.util.Map.of() : snapshot.fields().stream().filter(field -> !field.mapped() || !field.eligible())
            .collect(java.util.stream.Collectors.toUnmodifiableMap(field -> (field.mapped() ? "WRITE|SERVER_WRITE_UNAVAILABLE|" : "MAPPING|NOT_MAPPED|")
                + field.control(), field -> 1L, Long::sum));
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
