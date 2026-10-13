package com.careerform.quality;

import java.time.Instant;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityStatsController {
    private final QualityStats stats;

    public QualityStatsController(QualityStats stats) { this.stats = stats; }

    @GetMapping("/api/v1/quality/stats")
    public QualityStatsResponse stats(@RequestParam(required = false) Instant from, @RequestParam(required = false) Instant to,
                                      @RequestParam(required = false) String site, @RequestParam(required = false) String structure,
                                      @RequestParam(required = false) String route, @RequestParam(required = false) String version,
                                      @RequestParam(defaultValue = "FULL") String groupBy) {
        return stats.query(from, to, site, structure, route, version, groupBy);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalid() { return ResponseEntity.badRequest().body(Map.of("error", "NARROW_OR_CORRECT_FILTERS")); }
}
