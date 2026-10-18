package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.concurrent.TimeUnit;

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
    private final long fallbackVersion;
    private final FormAnalysisCompanyMongoRepository companies;

    @org.springframework.beans.factory.annotation.Autowired
    public MongoGreetingPolicyProvider(
        FormAnalysisCompanyMongoRepository companies,
        FormAnalysisPolicyMongoRepository policies,
        SupportedProfileFields supportedProfileFields,
        @Value("${careerform.greeting.active-policy-version:8}") long activeVersion
    ) {
        this.policies = policies;
        this.supportedProfileFields = supportedProfileFields;
        this.fallbackVersion = activeVersion;
        this.companies = companies;
    }

    // Retain the explicit-version constructor for isolated repository consumers.
    MongoGreetingPolicyProvider(FormAnalysisPolicyMongoRepository policies, SupportedProfileFields supportedProfileFields, long activeVersion) {
        this(null, policies, supportedProfileFields, activeVersion);
    }

    private long activeVersion() {
        return companies == null ? fallbackVersion : companies.findByCompanyKey(POLICY_KEY)
            .map(FormAnalysisCompanyDocument::activePolicyVersion).orElse(fallbackVersion);
    }

    public com.careerform.formanalysis.dto.ExecutionPolicy executionPolicy() {
        return policies.findByCompanyKeyAndVersion(POLICY_KEY, activeVersion())
            .map(FormAnalysisPolicyDocument::executionPolicy)
            .orElseThrow(() -> new IllegalStateException("Component execution policy unavailable"));
    }

    @Override
    public LookupResult find() {
        long startedAt = System.nanoTime();
        try {
            long activeVersion = activeVersion();
            if(activeVersion < 1)return new Unavailable();
            var result = policies.findByCompanyKeyAndVersion(POLICY_KEY, activeVersion)
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
            log.info("DB_RESULT operation=greeting-policy-lookup outcome=success durationMs={}",
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt));
            return result;
        }
        catch (RuntimeException exception) {
            log.warn("DB_RESULT operation=greeting-policy-lookup outcome=failure failure={} durationMs={}",
                exception.getClass().getSimpleName(),
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt));
            return new Unavailable();
        }
    }
}
