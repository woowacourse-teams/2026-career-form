package com.careerform.formanalysis.infrastructure.persistence.mongo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.LookupResult;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;
import com.careerform.formanalysis.application.port.GreetingPolicyProvider;

@Component
public final class MongoGreetingPolicyProvider implements GreetingPolicyProvider {

    private static final String POLICY_KEY = "greeting";
    private static final Logger log = LoggerFactory.getLogger(MongoGreetingPolicyProvider.class);

    private final FormAnalysisPolicyMongoRepository policies;
    private final SupportedProfileFields supportedProfileFields;
    private final long activeVersion;

    public MongoGreetingPolicyProvider(
        FormAnalysisPolicyMongoRepository policies,
        SupportedProfileFields supportedProfileFields,
        @Value("${careerform.greeting.active-policy-version:1}") long activeVersion
    ) {
        this.policies = policies;
        this.supportedProfileFields = supportedProfileFields;
        this.activeVersion = activeVersion;
    }

    @Override
    public LookupResult find() {
        if (activeVersion < 1) {
            return new Unavailable();
        }
        try {
            return policies.findByCompanyKeyAndVersion(POLICY_KEY, activeVersion)
                .filter(document -> POLICY_KEY.equals(document.companyKey())
                    && document.version() == activeVersion)
                .<LookupResult>map(document -> new Available(CompanyFormPolicy.create(
                    document.companyKey(),
                    document.version(),
                    document.preparationFingerprint(),
                    document.fieldsFingerprint(),
                    document.actionRules(),
                    document.fieldRules(),
                    supportedProfileFields::contains
                )))
                .orElseGet(Unavailable::new);
        }
        catch (RuntimeException exception) {
            log.warn("Greeting policy lookup failed failure={}",
                exception.getClass().getSimpleName());
            return new Unavailable();
        }
    }
}
