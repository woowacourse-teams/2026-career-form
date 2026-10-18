package com.careerform.formanalysis.api;

import com.careerform.formanalysis.dto.ExecutionPolicy;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.infrastructure.persistence.mongo.ExecutionPolicyLookup;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
public final class ExecutionPolicyController {
    private final ExecutionPolicyLookup policies;
    public ExecutionPolicyController(ExecutionPolicyLookup policies) { this.policies = policies; }
    public record Response(ExecutionPolicy executionPolicy) {}
    @PostMapping("/api/v1/execution-policy")
    public Response lookup(@Valid @RequestBody Site site) {
        return new Response(policies.find(site.host(), site.pathPattern()));
    }
}
