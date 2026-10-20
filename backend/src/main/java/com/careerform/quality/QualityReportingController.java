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
    private final QualityAsyncService observations;

    public QualityReportingController(QualityAsyncService observations) { this.observations = observations; }

    @PostMapping("/api/v1/quality/executions")
    public ResponseEntity<QualityRegistration.Credentials> register(@RequestBody QualityRegistration.Input input) {
        return ResponseEntity.status(201).body(observations.register(input));
    }

    @ExceptionHandler(QualityAdmissionException.class)
    public ResponseEntity<Map<String, String>> unavailable(QualityAdmissionException exception) {
        return ResponseEntity.status(exception.status()).body(Map.of("error", "QUALITY_UNAVAILABLE"));
    }

    @PostMapping("/api/v1/quality/executions/{runId}/report")
    public ResponseEntity<Void> report(@PathVariable String runId, @RequestBody QualityCollectionService.Report report, HttpServletRequest request) {
        observations.report(runId, QualityApiFilter.bearer(request), report);
        return ResponseEntity.accepted().build();
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalid() { return ResponseEntity.badRequest().body(Map.of("error", "INVALID_REPORT")); }
}
