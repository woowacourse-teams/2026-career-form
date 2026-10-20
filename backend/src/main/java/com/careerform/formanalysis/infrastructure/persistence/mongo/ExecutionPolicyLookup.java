package com.careerform.formanalysis.infrastructure.persistence.mongo;
import org.springframework.stereotype.Component;
import com.careerform.formanalysis.dto.ExecutionPolicy;
@Component
public final class ExecutionPolicyLookup {
    private final MongoHplacePolicyProvider hplace;
    private final FormAnalysisCompanyMongoRepository companies;
    private final FormAnalysisPolicyMongoRepository policies;
    private final com.careerform.formanalysis.application.port.GreetingDomainEvidence domains;
    private final MongoGreetingPolicyProvider greeting;
    private final org.springframework.data.mongodb.core.MongoTemplate mongo;
    public ExecutionPolicyLookup(FormAnalysisCompanyMongoRepository companies, FormAnalysisPolicyMongoRepository policies, com.careerform.formanalysis.application.port.GreetingDomainEvidence domains, MongoGreetingPolicyProvider greeting, org.springframework.data.mongodb.core.MongoTemplate mongo) {
        this(companies, policies, domains, greeting, mongo,
            new MongoHplacePolicyProvider(policies, new com.careerform.formanalysis.application.SupportedProfileFields(), 4));
    }
    @org.springframework.beans.factory.annotation.Autowired
    public ExecutionPolicyLookup(FormAnalysisCompanyMongoRepository companies, FormAnalysisPolicyMongoRepository policies,
        com.careerform.formanalysis.application.port.GreetingDomainEvidence domains, MongoGreetingPolicyProvider greeting,
        org.springframework.data.mongodb.core.MongoTemplate mongo, MongoHplacePolicyProvider hplace) {
        this.hplace = hplace;
        this.mongo = mongo;
        this.companies = companies; this.policies = policies; this.domains = domains; this.greeting = greeting;
    }
    public ExecutionPolicy find(String host, String path) {
        var policy = findSite(host, path);
        var provider = mongo.findById("address-provider-v1", org.bson.Document.class, "execution_provider_policies");
        if (provider == null) return policy;
        @SuppressWarnings("unchecked")
        var data = (java.util.Map<String,Object>) provider.get("policy");
        if (policy == null) policy = new ExecutionPolicy(1, java.util.List.of(), java.util.List.of(), null, null, null);
        return policy.withProvider(data);
    }
    private ExecutionPolicy findSite(String host, String path) {
        var company = companies.findByHost(host.toLowerCase(java.util.Locale.ROOT));
        if (company.isPresent()) {
            return company.filter(c -> c.pathPrefixes() != null && c.pathPrefixes().stream().anyMatch(path::startsWith))
                .flatMap(c -> policies.findByCompanyKeyAndVersion(c.companyKey(), c.activePolicyVersion()))
                .map(FormAnalysisPolicyDocument::executionPolicy).orElse(null);
        }
        if (com.careerform.formanalysis.application.policy.HplaceApplicantSite.matches(host, path)) {
            return com.careerform.formanalysis.application.policy.HplaceApplicantSite.DETAIL_PATH.equals(path)
                ? hplace.executionPolicy() : null;
        }
        return switch (domains.classify(host, path)) {
            case POSITIVE -> greeting.executionPolicy();
            case NO_POSITIVE_EVIDENCE -> null;
            case RETRYABLE_FAILURE -> throw new IllegalStateException("Site policy classification unavailable");
        };
    }
}
