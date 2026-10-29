package com.careerform.admission;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@org.springframework.context.annotation.Conditional(AdmissionAvailableCondition.class)
public final class InstallController {
    private final InstallService service;
    private final TrustedClientAddress addresses;
    public InstallController(InstallService service, TrustedClientAddress addresses) { this.service = service; this.addresses = addresses; }
    public record Registration(@JsonProperty("key") String registrationKey) {
        @Override public String toString() { return "Registration[redacted]"; }
    }
    @PostMapping("/api/v1/analysis-installations")
    public ResponseEntity<InstallService.Credentials> register(@RequestBody Registration input, HttpServletRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.register(input.registrationKey(), addresses.resolve(request)));
    }
}
