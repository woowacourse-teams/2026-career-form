package com.careerform.formanalysis.application;

import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.policy.StoredPolicyActionResolver;
import com.careerform.formanalysis.application.policy.StoredPolicyFieldMappingResolver;
import com.careerform.formanalysis.application.policy.StoredPolicyFingerprint;
import com.careerform.formanalysis.application.policy.GreetingFormFingerprint;
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

    private final CompanyFormPolicyProvider policyProvider;
    private final GreetingDomainEvidence greetingDomainEvidence;
    private final GreetingPolicyProvider greetingPolicyProvider;
    private final GreetingRoutingContext routingContexts;
    private final StoredPolicyFingerprint fingerprint = new StoredPolicyFingerprint();
    private final GreetingFormFingerprint greetingFingerprint = new GreetingFormFingerprint();

    public FormAnalysisRouter(CompanyFormPolicyProvider policyProvider) {
        this(policyProvider,
            (host, path) -> GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE,
            CompanyFormPolicyProvider.Unavailable::new,
            new GreetingRoutingContext());
    }

    public FormAnalysisRouter(
        CompanyFormPolicyProvider policyProvider,
        GreetingDomainEvidence greetingDomainEvidence,
        GreetingPolicyProvider greetingPolicyProvider
    ) {
        this(policyProvider, greetingDomainEvidence, greetingPolicyProvider,
            new GreetingRoutingContext());
    }

    @Autowired
    public FormAnalysisRouter(
        CompanyFormPolicyProvider policyProvider,
        GreetingDomainEvidence greetingDomainEvidence,
        GreetingPolicyProvider greetingPolicyProvider,
        GreetingRoutingContext routingContexts
    ) {
        this.policyProvider = policyProvider;
        this.greetingDomainEvidence = greetingDomainEvidence;
        this.greetingPolicyProvider = greetingPolicyProvider;
        this.routingContexts = routingContexts;
    }

    public ActionRoute route(PreparationAnalysisRequest request) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            request.site().host(),
            request.site().pathPattern()
        );
        boolean greetingCandidate = false;
        if (lookup instanceof NotRegistered) {
            lookup = greetingLookup(request.site().host(), request.site().pathPattern());
            if (lookup instanceof NotRegistered) {
                return new ActionRoute(RouteKind.GENERIC, null);
            }
            if (lookup == null) {
                return new ActionRoute(RouteKind.DNS_UNAVAILABLE, null);
            }
            greetingCandidate = true;
        }
        if (!(lookup instanceof Available available)) {
            return new ActionRoute(RouteKind.POLICY_UNAVAILABLE, null, greetingCandidate);
        }
        CompanyFormPolicy policy = available.policy();
        if (!fingerprint.matches(policy, request)) {
            return new ActionRoute(RouteKind.STRUCTURE_MISMATCH, null, greetingCandidate);
        }
        return new ActionRoute(
            RouteKind.ADAPTER,
            new StoredPolicyActionResolver(policy),
            "greeting".equals(policy.companyKey())
        );
    }

    public FieldRoute route(FieldsAnalysisRequest request) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            request.site().host(),
            request.site().pathPattern()
        );
        if (lookup instanceof NotRegistered) {
            if (request.routingContext() != null) {
                lookup = routingContexts.isValid(
                    request.routingContext(),
                    request.site().host(),
                    request.site().pathPattern()
                ) ? greetingPolicyProvider.find() : new CompanyFormPolicyProvider.Unavailable();
            }
            else {
                lookup = greetingLookup(request.site().host(), request.site().pathPattern());
                if (lookup instanceof Available) {
                    return new FieldRoute(RouteKind.POLICY_UNAVAILABLE, null);
                }
            }
            if (lookup instanceof NotRegistered) {
                return new FieldRoute(RouteKind.GENERIC, null);
            }
            if (lookup == null) {
                return new FieldRoute(RouteKind.DNS_UNAVAILABLE, null);
            }
        }
        if (!(lookup instanceof Available available)) {
            return new FieldRoute(RouteKind.POLICY_UNAVAILABLE, null);
        }
        CompanyFormPolicy policy = available.policy();
        boolean greeting = "greeting".equals(policy.companyKey());
        if (!(greeting
            ? greetingFingerprint.matches(request)
            : fingerprint.matches(policy, request))) {
            return new FieldRoute(RouteKind.STRUCTURE_MISMATCH, null);
        }
        return new FieldRoute(
            RouteKind.ADAPTER,
            new StoredPolicyFieldMappingResolver(policy, greeting)
        );
    }

    public GenericRouteKind routeGeneric(String host, String pathPattern) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            host,
            pathPattern
        );
        if (lookup instanceof NotRegistered) {
            return GenericRouteKind.GENERIC;
        }
        if (lookup instanceof Available) {
            return GenericRouteKind.STATIC_POLICY_PRESENT;
        }
        return GenericRouteKind.POLICY_UNAVAILABLE;
    }

    private CompanyFormPolicyProvider.LookupResult greetingLookup(
        String host,
        String pathPattern
    ) {
        return switch (greetingDomainEvidence.classify(host, pathPattern)) {
            case OUT_OF_SCOPE -> new NotRegistered();
            case POSITIVE_STABLE -> greetingPolicyProvider.find();
            case POSITIVE -> routingContexts.rememberPositive(host, pathPattern)
                ? greetingPolicyProvider.find() : null;
            case NO_POSITIVE_EVIDENCE -> routingContexts.requiresFailClosedOnMissingEvidence(
                host, pathPattern)
                ? null : new NotRegistered();
            case RETRYABLE_FAILURE -> null;
        };
    }

    public enum RouteKind {
        GENERIC,
        ADAPTER,
        STRUCTURE_MISMATCH,
        POLICY_UNAVAILABLE,
        DNS_UNAVAILABLE
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

    public record FieldRoute(RouteKind kind, FieldMappingResolver resolver) {
    }
}
