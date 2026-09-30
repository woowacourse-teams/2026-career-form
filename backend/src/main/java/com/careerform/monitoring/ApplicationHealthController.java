package com.careerform.monitoring;

import java.util.Map;

import org.springframework.boot.health.actuate.endpoint.HealthEndpoint;
import org.springframework.boot.health.contributor.Status;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ApplicationHealthController {

    private final HealthEndpoint healthEndpoint;

    public ApplicationHealthController(HealthEndpoint healthEndpoint) {
        this.healthEndpoint = healthEndpoint;
    }

    @GetMapping("/actuator/health")
    public ResponseEntity<Map<String, String>> health() {
        var status = healthEndpoint.health().getStatus();
        var code = Status.DOWN.equals(status) || Status.OUT_OF_SERVICE.equals(status) ? 503 : 200;
        return ResponseEntity.status(code).body(Map.of("status", status.getCode()));
    }
}
