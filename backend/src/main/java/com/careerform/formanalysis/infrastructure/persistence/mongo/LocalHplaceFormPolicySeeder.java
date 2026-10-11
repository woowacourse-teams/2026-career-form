package com.careerform.formanalysis.infrastructure.persistence.mongo;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("local")
final class LocalHplaceFormPolicySeeder implements ApplicationRunner {

    private final FormAnalysisPolicyMongoRepository policies;

    LocalHplaceFormPolicySeeder(FormAnalysisPolicyMongoRepository policies) {
        this.policies = policies;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        policies.save(HplaceCompanyFormPolicyFactory.create());
    }
}
