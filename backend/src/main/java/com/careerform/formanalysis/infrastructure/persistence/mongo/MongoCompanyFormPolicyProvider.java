package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;

@Component
public final class MongoCompanyFormPolicyProvider
    implements CompanyFormPolicyProvider {

    private final FormAnalysisCompanyMongoRepository companies;
    private final FormAnalysisPolicyMongoRepository policies;
    private final SupportedProfileFields supportedProfileFields;

    public MongoCompanyFormPolicyProvider(
        FormAnalysisCompanyMongoRepository companies,
        FormAnalysisPolicyMongoRepository policies,
        SupportedProfileFields supportedProfileFields
    ) {
        this.companies = companies;
        this.policies = policies;
        this.supportedProfileFields = supportedProfileFields;
    }

    @Override
    public LookupResult find(String host, String pathPattern) {
        try {
            Optional<FormAnalysisCompanyDocument> company = companies.findByHost(
                normalizeHost(host)
            );
            if (company.isEmpty() || !matchesPath(company.orElseThrow(), pathPattern)) {
                return new NotRegistered();
            }
            return loadActivePolicy(company.orElseThrow());
        }
        catch (RuntimeException exception) {
            return new Unavailable();
        }
    }

    private LookupResult loadActivePolicy(FormAnalysisCompanyDocument company) {
        if (isBlank(company.companyKey()) || company.activePolicyVersion() < 1) {
            return new Unavailable();
        }
        Optional<FormAnalysisPolicyDocument> document =
            policies.findByCompanyKeyAndVersion(
                company.companyKey(),
                company.activePolicyVersion()
            );
        if (document.isEmpty()) {
            return new Unavailable();
        }
        FormAnalysisPolicyDocument policy = document.orElseThrow();
        if (!company.companyKey().equals(policy.companyKey())
            || company.activePolicyVersion() != policy.version()) {
            return new Unavailable();
        }
        return new Available(CompanyFormPolicy.create(
            policy.companyKey(),
            policy.version(),
            policy.preparationFingerprint(),
            policy.fieldsFingerprint(),
            policy.actionRules(),
            policy.fieldRules(),
            supportedProfileFields::contains
        ));
    }

    private static boolean matchesPath(
        FormAnalysisCompanyDocument company,
        String pathPattern
    ) {
        List<String> prefixes = company.pathPrefixes();
        return prefixes != null
            && pathPattern != null
            && prefixes.stream()
                .filter(prefix -> prefix != null && !prefix.isBlank())
                .anyMatch(pathPattern::startsWith);
    }

    private static String normalizeHost(String host) {
        String normalized = host.toLowerCase(Locale.ROOT);
        return normalized.endsWith(".")
            ? normalized.substring(0, normalized.length() - 1)
            : normalized;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
