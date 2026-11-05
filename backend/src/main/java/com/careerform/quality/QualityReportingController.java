package com.careerform.quality;

import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityReportingController {
    private final QualityCollectionService collector;

    public QualityReportingController(QualityCollectionService collector) { this.collector = collector; }

    @PostMapping("/api/v1/quality/executions/{runId}/report")
    public ResponseEntity<Void> report(@PathVariable String runId, @RequestBody QualityCollectionService.Report report, HttpServletRequest request) {
        collector.report(runId, QualityApiFilter.bearer(request), report);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalid() { return ResponseEntity.badRequest().body(Map.of("error", "INVALID_REPORT")); }
}
