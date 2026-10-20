package com.careerform.formanalysis.infrastructure.persistence.mongo;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Insert-only bootstrap of the Hplace policy documents (legacy v3, native v4) in every
 * deployed profile, like {@link StartupPolicySeeder}. Existing versions are never modified:
 * a changed policy ships as a new version, and the active-version pointer
 * ({@code careerform.hplace.active-policy-version}) is raised by a person after the matching
 * extension build is installed.
 */
@Component
@Profile({"local", "dev", "staging", "prod"})
final class HplaceFormPolicySeeder implements ApplicationRunner {
    static final String[] PROFILES = {"local", "dev", "staging", "prod"};

    private final FormAnalysisPolicyMongoRepository policies;

    HplaceFormPolicySeeder(FormAnalysisPolicyMongoRepository policies) {
        this.policies = policies;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        for (var document : java.util.List.of(HplaceCompanyFormPolicyFactory.create(), HplaceCompanyFormPolicyFactory.createNative())) {
            if (policies.findByCompanyKeyAndVersion(document.companyKey(), document.version()).isEmpty()) {
                try {
                    policies.insert(document);
                } catch (org.springframework.dao.DuplicateKeyException concurrentInsert) {
                    if (policies.findByCompanyKeyAndVersion(document.companyKey(), document.version()).isEmpty()) {
                        throw concurrentInsert;
                    }
                }
            }
        }
    }
}
