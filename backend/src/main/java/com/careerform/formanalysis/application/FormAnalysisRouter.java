package com.careerform.formanalysis.application;

import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.policy.StoredPolicyActionResolver;
import com.careerform.formanalysis.application.policy.StoredPolicyFieldMappingResolver;
import com.careerform.formanalysis.application.policy.StoredPolicyFingerprint;
import com.careerform.formanalysis.application.policy.GreetingFormFingerprint;
import com.careerform.formanalysis.application.policy.HplaceFormFingerprint;
import com.careerform.formanalysis.application.port.HplacePolicyProvider;
import com.careerform.formanalysis.application.policy.GreetingFieldMappingResolver;
import com.careerform.formanalysis.application.policy.GreetingActionResolver;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence;
import com.careerform.formanalysis.application.port.GreetingPolicyProvider;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@Component
public final class FormAnalysisRouter {

    private static final Pattern HPLACE_HOST = Pattern.compile(
        "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.(?:recruiter\\.co\\.kr|recruiter\\.im)$",
        Pattern.CASE_INSENSITIVE
    );
    private final HplacePolicyProvider hplacePolicyProvider;
    private final HplaceFormFingerprint hplaceFingerprint = new HplaceFormFingerprint();
    private final CompanyFormPolicyProvider policyProvider;
    private final GreetingPolicyProvider greetingPolicyProvider;
    private final GreetingDomainEvidence greetingDomainEvidence;
    private final StoredPolicyFingerprint fingerprint = new StoredPolicyFingerprint();
    private final GreetingFormFingerprint greetingFingerprint = new GreetingFormFingerprint();

    public FormAnalysisRouter(CompanyFormPolicyProvider policyProvider) {
        this(policyProvider, (host, path) -> GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE,
            CompanyFormPolicyProvider.Unavailable::new);
    }

    public FormAnalysisRouter(CompanyFormPolicyProvider policyProvider,
        GreetingDomainEvidence greetingDomainEvidence, GreetingPolicyProvider greetingPolicyProvider) {
        this(policyProvider, greetingDomainEvidence, greetingPolicyProvider,
            CompanyFormPolicyProvider.Unavailable::new);
    }

    @Autowired
    public FormAnalysisRouter(CompanyFormPolicyProvider policyProvider,
        GreetingDomainEvidence greetingDomainEvidence, GreetingPolicyProvider greetingPolicyProvider,
        HplacePolicyProvider hplacePolicyProvider) {
        this.hplacePolicyProvider = hplacePolicyProvider;
        this.policyProvider = policyProvider;
        this.greetingDomainEvidence = greetingDomainEvidence;
        this.greetingPolicyProvider = greetingPolicyProvider;
    }

    public ActionRoute route(PreparationAnalysisRequest request) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            request.site().host(),
            request.site().pathPattern()
        );
        boolean greetingCandidate = false;
        if (lookup instanceof NotRegistered) {
            lookup = sharedLookup(request.site().host(), request.site().pathPattern());
            if (lookup instanceof NotRegistered) {
                return new ActionRoute(RouteKind.GENERIC, null);
            }
            greetingCandidate = !isHplaceApplicant(request.site().host(), request.site().pathPattern());
        }
        if (!(lookup instanceof Available available)) {
            return new ActionRoute(RouteKind.POLICY_UNAVAILABLE, null, greetingCandidate);
        }
        CompanyFormPolicy policy = available.policy();
        if (!("hplace".equals(policy.companyKey())
            ? hplaceFingerprint.matches(request) : fingerprint.matches(policy, request))) {
            return new ActionRoute(RouteKind.STRUCTURE_MISMATCH, null, greetingCandidate);
        }
        return new ActionRoute(
            RouteKind.ADAPTER,
            "greeting".equals(policy.companyKey()) ? new GreetingActionResolver()
                : new StoredPolicyActionResolver(policy),
            "greeting".equals(policy.companyKey())
        );
    }

    public FieldRoute route(FieldsAnalysisRequest request) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            request.site().host(),
            request.site().pathPattern()
        );
        if (lookup instanceof NotRegistered) {
            lookup = sharedLookup(request.site().host(), request.site().pathPattern());
            if (lookup instanceof NotRegistered) {
                return new FieldRoute(RouteKind.GENERIC, null);
            }

        }
        if (!(lookup instanceof Available available)) {
            return new FieldRoute(RouteKind.POLICY_UNAVAILABLE, null);
        }
        CompanyFormPolicy policy = available.policy();
        boolean greeting = "greeting".equals(policy.companyKey());
        boolean hplace = "hplace".equals(policy.companyKey());
        if (!(hplace ? hplaceFingerprint.matches(request) : greeting
            ? greetingFingerprint.matches(request)
            : fingerprint.matches(policy, request))) {
            return new FieldRoute(RouteKind.STRUCTURE_MISMATCH, null);
        }
        return new FieldRoute(
            RouteKind.ADAPTER,
            greeting ? new GreetingFieldMappingResolver(policy)
                : new StoredPolicyFieldMappingResolver(policy, hplace), greeting
        );
    }

    public GenericRouteKind routeGeneric(String host, String pathPattern) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            host,
            pathPattern
        );
        if (lookup instanceof NotRegistered) {
            lookup = sharedLookup(host, pathPattern);
        }
        if (lookup instanceof NotRegistered) {
            return GenericRouteKind.GENERIC;
        }
        if (lookup instanceof Available) {
            return GenericRouteKind.STATIC_POLICY_PRESENT;
        }
        return GenericRouteKind.POLICY_UNAVAILABLE;
    }

    private CompanyFormPolicyProvider.LookupResult sharedLookup(String host, String pathPattern) {
        if (isHplaceApplicant(host, pathPattern)) {
            if (!"/app/applicant/registResume".equals(pathPattern)) {
                return new CompanyFormPolicyProvider.Unavailable();
            }
            var lookup = hplacePolicyProvider.find();
            return lookup instanceof Available ? lookup : new CompanyFormPolicyProvider.Unavailable();
        }
        return greetingLookup(host, pathPattern);
    }

    private static boolean isHplaceApplicant(String host, String pathPattern) {
        return host != null && HPLACE_HOST.matcher(host).matches() && pathPattern != null
            && (pathPattern.startsWith("/app/applicant/") || pathPattern.equals("/app/applicant")
                || pathPattern.startsWith("/v1/applicant/") || pathPattern.equals("/v1/applicant"));
    }

    private CompanyFormPolicyProvider.LookupResult greetingLookup(
        String host,
        String pathPattern
    ) {
        return switch (greetingDomainEvidence.classify(host, pathPattern)) {
            case POSITIVE -> greetingPolicyProvider.find();
            case NO_POSITIVE_EVIDENCE -> new NotRegistered();
            case RETRYABLE_FAILURE -> new CompanyFormPolicyProvider.Unavailable();
        };
    }

    public enum RouteKind {
        GENERIC,
        ADAPTER,
        STRUCTURE_MISMATCH,
        POLICY_UNAVAILABLE
    }

    public enum GenericRouteKind {
        GENERIC,
        STATIC_POLICY_PRESENT,
        POLICY_UNAVAILABLE
    }

    public record ActionRoute(RouteKind kind, ActionResolver resolver, boolean greeting) {

        public ActionRoute(RouteKind kind, ActionResolver resolver) {
            this(kind, resolver, false);
        }
    }

    public record FieldRoute(RouteKind kind, FieldMappingResolver resolver, boolean greeting) {
        public FieldRoute(RouteKind kind, FieldMappingResolver resolver) {
            this(kind, resolver, false);
        }
    }
}
