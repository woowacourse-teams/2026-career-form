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
import com.careerform.formanalysis.application.port.HplacePolicyProvider;

@Component
public final class MongoHplacePolicyProvider implements HplacePolicyProvider {

    private static final String POLICY_KEY = "hplace";
    private static final Logger log = LoggerFactory.getLogger(MongoHplacePolicyProvider.class);

    private final FormAnalysisPolicyMongoRepository policies;
    private final SupportedProfileFields supportedProfileFields;
    private final long activeVersion;

    public MongoHplacePolicyProvider(
        FormAnalysisPolicyMongoRepository policies,
        SupportedProfileFields supportedProfileFields,
        @Value("${careerform.hplace.active-policy-version:4}") long activeVersion
    ) {
        this.policies = policies;
        this.supportedProfileFields = supportedProfileFields;
        this.activeVersion = activeVersion;
    }

    public com.careerform.formanalysis.dto.ExecutionPolicy executionPolicy() {
        var result = find();
        if (result instanceof Available available) {
            return available.policy().executionPolicy();
        }
        throw new IllegalStateException("Hplace execution policy unavailable");
    }

    @Override
    public LookupResult find() {
        if (activeVersion < 1) {
            return new Unavailable();
        }
        long startedAt = System.nanoTime();
        try {
            var documentLookup = policies.findByCompanyKeyAndVersion(POLICY_KEY, activeVersion);
            // Only an absent v4 document permits the validated legacy contract.
            // Invalid documents and failed lookups must remain unavailable.
            long selectedVersion = activeVersion;
            if (activeVersion == 4 && documentLookup.isEmpty()) {
                documentLookup = policies.findByCompanyKeyAndVersion(POLICY_KEY, 3);
                selectedVersion = 3;
            }
            final long expectedVersion = selectedVersion;
            var result = documentLookup
                .filter(document -> POLICY_KEY.equals(document.companyKey())
                    && document.version() == expectedVersion
                    && (expectedVersion < 4 || document.executionPolicy() != null && !document.sectionContracts().isEmpty()))
                .<LookupResult>map(document -> new Available(CompanyFormPolicy.create(
                    document.companyKey(),
                    document.version(),
                    document.preparationFingerprint(),
                    document.fieldsFingerprint(),
                    document.actionRules(),
                    document.fieldRules(), document.sectionContracts(), document.executionPolicy(),
                    supportedProfileFields::contains
                )))
                .orElseGet(Unavailable::new);
            log.info("DB_RESULT operation=hplace-policy-lookup outcome=success durationMs={}",
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt));
            return result;
        }
        catch (RuntimeException exception) {
            log.warn("DB_RESULT operation=hplace-policy-lookup outcome=failure failure={} durationMs={}",
                exception.getClass().getSimpleName(),
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt));
            return new Unavailable();
        }
    }
}
