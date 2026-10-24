package com.careerform.formanalysis.api;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.formanalysis.infrastructure.persistence.mongo.PolicyVersionReport;

/** Read-only view for release checks: the deployed seed's active versions next to the database's. */
@RestController
public final class PolicyVersionsController {
    private final PolicyVersionReport report;

    public PolicyVersionsController(PolicyVersionReport report) {
        this.report = report;
    }

    public record Response(List<PolicyVersionReport.Entry> companies) {}

    @GetMapping("/api/v1/policy-versions")
    public Response versions() {
        return new Response(report.entries());
    }
}
