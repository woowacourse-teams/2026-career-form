package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.List;

import org.springframework.stereotype.Component;

/** Pairs each company's seed active version (deployed commit) with the version the database serves. */
@Component
public final class PolicyVersionReport {
    public record Entry(String companyKey, String host, long seedActiveVersion, Long activeVersion, boolean inSync) {}

    private final StartupPolicySeed seed;
    private final FormAnalysisCompanyMongoRepository companies;

    public PolicyVersionReport(StartupPolicySeed seed, FormAnalysisCompanyMongoRepository companies) {
        this.seed = seed;
        this.companies = companies;
    }

    public List<Entry> entries() {
        return seed.companies().stream().map(c -> {
            var active = companies.findByCompanyKey(c.companyKey())
                .map(FormAnalysisCompanyDocument::activePolicyVersion).orElse(null);
            return new Entry(c.companyKey(), c.host(), c.activePolicyVersion(), active,
                active != null && active == c.activePolicyVersion());
        }).toList();
    }
}
