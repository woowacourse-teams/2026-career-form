package com.careerform.formanalysis.infrastructure.persistence.mongo;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("local")
final class LocalGreetingFormPolicySeeder implements ApplicationRunner {

    private final FormAnalysisPolicyMongoRepository policies;

    private final FormAnalysisCompanyMongoRepository companies;
    @org.springframework.beans.factory.annotation.Autowired
    LocalGreetingFormPolicySeeder(FormAnalysisCompanyMongoRepository companies, FormAnalysisPolicyMongoRepository policies) {
        this.policies = policies;
        this.companies = companies;
    }

    LocalGreetingFormPolicySeeder(FormAnalysisPolicyMongoRepository policies) { this(null, policies); }

    @Override
    public void run(ApplicationArguments arguments) {
        var policy = GreetingCompanyFormPolicyFactory.create();
        if (!policies.existsById(policy.id()) && policies.findByCompanyKeyAndVersion(policy.companyKey(), policy.version()).isEmpty()) {
            try { policies.insert(policy); } catch (org.springframework.dao.DuplicateKeyException ignored) { /* preserve existing */ }
        }
        if (companies != null && companies.findByCompanyKey("greeting").isEmpty()) {
            try { companies.insert(new FormAnalysisCompanyDocument("greeting-platform", "greeting", "greetinghr.com", java.util.List.of(), policy.version())); }
            catch (org.springframework.dao.DuplicateKeyException ignored) { /* preserve existing */ }
        }
    }
}
